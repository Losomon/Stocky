# Supabase production architecture and migration plan

**Status:** Architecture plan only. No Supabase project, credentials, cloud schema, authentication, or synchronization code is configured yet.

## Verified starting point

Stockly is an offline-first Vite app. Dexie stores the `stockly` database in IndexedDB, and `src/lib/engine.ts` contains the stock and transaction rules independently of the UI. Sales and purchase receipts are written atomically on-device; stock is derived from signed movements; receipt IDs make retries safe. Backup validation and restore are also covered by tests.

The current local baseline passes all 115 unit tests and the production TypeScript/Vite build. The app has no authenticated identity or cloud system of record yet. In particular:

- `BUSINESS_ID` is the fixed placeholder `demo-business`.
- The staff list is a local roster of names, not login accounts or permissions.
- Dexie v6 migrates numeric movement, sale-item, purchase-item, receipt-item, and audit IDs to UUID strings without dropping rows. New writes and restored legacy backups also receive stable UUID strings; parent/child references are preserved.
- Business profile and device settings are stored locally. Device-specific settings must not be synchronized as business data.
- Dexie versions 2–4 contain migrations that clear demo-era data. Those migrations predate real customer data; future upgrades must preserve real data and must not repeat that behavior.

The existing local workflow remains the offline working store. Supabase becomes the cloud system of record after an explicit business setup or import; neither store should silently overwrite the other.

## Target platform and trust boundaries

| Concern | Target |
|---|---|
| Database | Supabase-managed PostgreSQL |
| Identity and sessions | Supabase Auth |
| Scoped reads | Supabase-generated REST API, protected by RLS |
| Multi-table business writes | PostgreSQL RPC functions or Edge Functions; one request per atomic business operation |
| Authorization | PostgreSQL RLS and server-side membership checks |
| Offline operation | Keep Dexie and the pure local engine |
| Frontend hosting | Keep the current Vite hosting initially |
| Secrets | Only the Supabase project URL and publishable/anon key may be in the browser. Never ship a service-role key. |

RLS is mandatory on every tenant-owned table. A client-supplied `business_id`, staff name, role, or user ID is not proof of authorization. Every operation must derive the caller from the verified Supabase session and check that caller's membership in the requested business. Service-role credentials, if needed by an Edge Function, stay server-side.

## Cloud data model

Use UUID primary keys for cloud records. Keep existing UUID string IDs when valid; move existing auto-increment child IDs to client-generated UUIDs in a tested, non-destructive Dexie migration before multi-device writes are enabled.

| Cloud table | Local source | Notes |
|---|---|---|
| `businesses` | `settings.business` | Profile fields move out of device settings. |
| `business_members` | New | `(business_id, user_id)` membership and role; `user_id` references Supabase Auth. |
| `staff_members` | `staff` | Keep historical staff identities; add an optional link to a member account. A roster entry alone grants no login or access. |
| `categories`, `products` | Same-named Dexie tables | Tenant-scoped uniqueness for SKU and non-empty barcode. |
| `suppliers`, `customers` | Same-named Dexie tables | Preserve archived state and historical references. |
| `sales`, `sale_items` | Same-named Dexie tables | Keep sale-time price and cost snapshots. |
| `purchases`, `purchase_items`, `receipts`, `receipt_items` | Same-named Dexie tables | Keep receipt-derived status and retry-proof receipt identities. |
| `stock_movements` | `movements` | Append-only signed ledger; stock remains derived, never copied onto products. |
| `stock_counts` | `counts` | Preserve expected/count/difference and reason. |
| `audit_entries` | `audit` | Append-only. New records include the authenticated actor; retain legacy staff labels for imported history. |
| Local-only settings | `settings` | Keep device staff selection, onboarding state, last backup and local sync cursor in Dexie, not as shared business records. |

Put `business_id` on every tenant-owned cloud row, including child/ledger tables that currently inherit ownership through a parent locally. Add composite foreign keys such as `(business_id, sale_id)` so a child row cannot refer across businesses. Make business-scoped unique keys explicit, for example `(business_id, sku)` and `(business_id, receipt_no)`.

Use `business_members` for authentication and authorization, and keep `staff_members` for the existing business roster. New sales, counts, receipts, and audit entries should record a trusted `actor_user_id` derived server-side from the session, plus an optional `staff_member_id` for the selected operational identity. Do not treat the current user-editable device staff name as an authenticated actor.

### Roles

Start with a small, server-enforced role set: `owner`, `admin`, `manager`, and `cashier`. Define an explicit permission matrix before exposing staff management:

- `owner`: all business actions, membership and role management.
- `admin`: business operations and staff management, but cannot remove or demote the owner.
- `manager`: day-to-day inventory, sales, purchasing, customers, and counts; no membership or role management.
- `cashier`: sales and permitted sale cancellation only; no product cost, staff, business, or role management.

RLS and trusted write functions must enforce this matrix. Hiding a button in React is not an authorization control.

## Synchronization and integrity rules

1. Keep local writes immediate and atomic. Add a Dexie outbox so each local business operation and its pending sync record commit in the same IndexedDB transaction.
2. Give every operation a client-generated UUID idempotency key. Retrying after a timeout must return the original result, not create another sale, receipt, movement, or audit entry.
3. Sync domain commands, not arbitrary table snapshots. A sale, cancellation, count, purchase receipt, and related line/movement/audit rows must be one server transaction. Reads may use the generated REST API; sensitive multi-row writes go through a trusted RPC or Edge Function.
4. Revalidate stock, purchase quantities, ownership, permissions, and referenced rows on the server. Lock the relevant product rows while validating and writing a sale or receipt.
5. Treat movements and audit entries as immutable append-only history. Do not resolve conflicts by replacing or deleting ledger rows.
6. Track remote revisions/cursors and local acknowledgements. Use explicit conflict responses for concurrent product edits and replayed/out-of-order operations. Preserve local pending operations until acknowledged.
7. Multi-device offline sales can race even when each device passes its local stock check. Before enabling offline sales on multiple devices, define the user-visible conflict policy. The safe default is to reject/review a server-side oversell conflict without silently dropping the sale or rewriting history.
8. Use tombstones or archived state for synced deletions so other devices can learn that a record was removed. Preserve the current rule that records with history cannot be hard-deleted.
9. Keep receipt numbering server-assigned or allocated transactionally and uniquely per business; the current local counter can collide across devices.

## Implementation sequence and gates

### 0. Preserve the local foundation

- Keep the engine and local workflows running without network access.
- Add forward-only Dexie migrations; remove any path that can clear real user data.
- Implemented in Dexie v6: migrate populated v5 child/ledger/audit rows to UUID strings and test preservation of records, relationships, stock, audit history, and backup/restore.
- Keep backups available before any ownership transfer or upgrade.

**Gate:** Existing tests/build pass. A populated v5 database upgrades with the same business data, relations, stock totals, and audit history. Restore remains all-or-nothing.

### 1. Business and membership schema

- Create businesses and memberships with one owner on business creation.
- Add roles, tenant keys, foreign keys, uniqueness constraints, and indexes.
- Seed no production data and do not expose the browser client until the schema is reviewed.

**Gate:** Database tests cover business creation, membership lifecycle, role invariants, and tenant-safe relationships.

### 2. Secure ownership with RLS

- Enable and force RLS on every tenant-owned table.
- Permit access only when `auth.uid()` has an active membership in that row's `business_id`.
- Restrict sensitive updates and writes by role; protect owner membership from removal or demotion.
- Keep ledger and audit rows append-only to application clients.

**Gate:** Automated tests using two authenticated businesses and an anonymous client prove cross-business `SELECT`, `INSERT`, `UPDATE`, and `DELETE` attempts are denied through the REST API—not merely through the UI.

### 3. Authentication

- Add sign-up, sign-in, sign-out, session restoration, and protected app routes.
- For a new account, create its business and owner membership through a trusted, atomic operation.
- For an existing local shop, require sign-in and an explicit choice to create/join a business or import local data. Do not automatically claim or upload data.

**Gate:** Expired sessions, failed sign-in, missing membership, and account switching do not expose another user's local or cloud data.

### 4. Explicit initial import

- Require a downloadable backup before import.
- Show the target business and record counts before upload.
- Preserve UUIDs where possible; assign stable UUIDs to legacy auto-increment rows and preserve all parent references.
- Validate links, row counts, audit history, and stock totals before and after import.
- Make import resumable and idempotent; never erase local data as an import side effect.

**Gate:** A test fixture imported twice creates no duplicates and produces identical record counts and per-product stock totals.

### 5. Synchronization

- Add the Dexie outbox, trusted atomic write endpoints, pull cursor, acknowledgements, retry/backoff, and conflict UI.
- Test online, offline, timeout-after-commit, duplicate retry, partial network failure, and simultaneous-device cases.
- Keep the app usable offline and visibly distinguish saved locally, pending sync, synced, and sync error states.

**Gate:** No acknowledged operation is lost or applied twice; a failed operation leaves local and cloud transaction groups understandable and recoverable.

### 6. Staff permissions and audit attribution

- Link authenticated members to optional staff roster records; enforce the role matrix in RLS/server commands.
- Write the authenticated actor to audit records server-side. Preserve old local staff-name history as historical attribution, not proof of identity.
- Add an audit screen only after server attribution and authorization tests pass.

**Gate:** Each protected action is attributed to the authenticated user, denied actions create no business mutation, and role tests cover every write command.

## First implementation scope

Do not build the full cloud system in one change. The first code milestone should be the non-destructive Dexie migration/ID groundwork and its tests. The next milestone is the reviewed Supabase SQL schema plus RLS tests. Add authentication UI only after cross-business isolation is proven. Synchronization and role-aware UI follow as separate milestones.

No Supabase project URL, keys, or credentials belong in this repository until a project is provisioned. Use environment variables for the publishable key and keep privileged credentials out of client builds and source control.
