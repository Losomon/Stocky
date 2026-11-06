// Generates scripts/stockly-backlog.json with full 28 issues
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'stockly-backlog.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const i = (key, title, milestone, labels, deps, body) => ({
  key, title, milestone, labels, dependencies: deps, body
});

data.issues = [
  i('1.1','Issue 1.1 — Set up Supabase project and environment configuration','M1 — Multi-business foundation',
    ['priority:critical','area:backend','area:database','type:feature'], [],
`## Description
Configure Supabase as Stockly's central backend and PostgreSQL database.

## Tasks
- Create Supabase project.
- Configure development and production environments.
- Install Supabase JavaScript client.
- Add environment variables.
- Configure database migrations.
- Configure authentication settings.
- Ensure secrets are never exposed in frontend code.

## Acceptance criteria
- Application connects successfully to Supabase.
- Development and production configurations are separate.
- No service-role key is exposed to the browser.
- Database migrations can be applied reproducibly.
- Existing local application still builds.

## Dependencies
None.`),
  i('1.2','Issue 1.2 — Design multi-tenant database schema','M1 — Multi-business foundation',
    ['priority:critical','area:database','type:feature'], ['1.1'],
`## Description
Design the database around multiple independent businesses sharing one PostgreSQL database.

## Required tables
| Table | Purpose |
| --- | --- |
| profiles | User profile information |
| businesses | Business records |
| business_members | Owner and worker memberships |
| invitations | Worker invitation records |
| products | Business products |
| categories | Product categories |
| customers | Business customers |
| suppliers | Business suppliers |
| sales | Sales transactions |
| sale_items | Individual sale items |
| purchases | Purchase transactions |
| purchase_items | Individual purchase items |
| stock_movements | Inventory movement history |
| audit_logs | Important activity history |

## Tasks
- Define primary and foreign keys.
- Add \`business_id\` to business-owned records.
- Define membership relationships.
- Add appropriate unique constraints.
- Define indexes for common queries.
- Define deletion and archival rules.
- Document the schema in \`SUPABASE-ARCHITECTURE.md\`.

## Acceptance criteria
- Every business-owned record is associated with a business.
- Foreign keys enforce valid relationships.
- Business membership cannot be duplicated.
- Indexes support common business-scoped queries.
- Database migrations are version-controlled.
- Schema supports two or more independent businesses.

## Dependencies
- Issue 1.1`),
  i('1.3','Issue 1.3 — Implement owner registration and authentication','M1 — Multi-business foundation',
    ['priority:critical','area:backend','area:frontend','type:feature'], ['1.1','1.2'],
`## Description
Implement secure owner registration, login and logout using Supabase Auth.

## Tasks
- Owner registration.
- Email verification.
- Login and logout.
- Password reset.
- Session persistence.
- Protected application routes.
- Authentication error handling.

## Acceptance criteria
- Owners can register independently.
- Users can log in on different devices.
- Sessions survive page refreshes.
- Protected pages reject unauthenticated users.
- Password reset works.
- Users cannot impersonate another account.

## Dependencies
- Issue 1.1
- Issue 1.2`),
  i('1.4','Issue 1.4 — Implement business creation and business profiles','M1 — Multi-business foundation',
    ['priority:critical','area:backend','area:frontend','type:feature'], ['1.3'],
`## Description
Allow authenticated owners to create and manage their businesses.

## Tasks
- Business creation form.
- Business name and contact information.
- Business profile management.
- Assign creator as business owner.
- Business selection after login.
- Business membership validation.

## Acceptance criteria
- An authenticated owner can create a business.
- Business creation automatically establishes owner membership.
- A business cannot be accessed by an unrelated account.
- Business information persists in PostgreSQL.
- Business selection reflects the user's actual memberships.

## Dependencies
- Issue 1.3`),
  i('1.5','Issue 1.5 — Implement worker invitations and account onboarding','M1 — Multi-business foundation',
    ['priority:critical','area:backend','area:frontend','type:feature'], ['1.3','1.4'],
`## Description
Allow business owners to invite workers into their businesses.

## Tasks
- Invitation creation.
- Invitation delivery by email.
- Secure invitation tokens.
- Invitation expiry.
- Invitation acceptance.
- Worker account creation.
- Membership activation.
- Invitation revocation.

## Acceptance criteria
- Owners can invite workers.
- Invitations are linked to the correct business.
- Expired invitations cannot be accepted.
- An invitation cannot be reused.
- Workers cannot join businesses without valid authorization.
- Workers see only businesses they belong to.

## Dependencies
- Issue 1.3
- Issue 1.4`),
  i('1.6','Issue 1.6 — Implement database-level Row Level Security','M1 — Multi-business foundation',
    ['priority:critical','area:database','area:security','type:feature'], ['1.2','1.3','1.4','1.5'],
`## Description
Implement PostgreSQL RLS to enforce business-level data isolation.

**Security critical.** Hiding another business's records in React is not security. The database must reject unauthorized access even when someone manually modifies API requests.

## Tasks
- Enable RLS on all business-owned tables.
- Create membership-based access policies.
- Restrict unauthorized reads.
- Restrict unauthorized inserts.
- Restrict unauthorized updates.
- Restrict unauthorized deletes.
- Prevent users from changing their own roles.
- Test access using independent authenticated accounts.

## Acceptance criteria
- Business A cannot read Business B records.
- Business A cannot modify Business B records.
- Business A cannot delete Business B records.
- Unauthorized inserts are rejected.
- Changing a frontend \`business_id\` cannot bypass security.
- Policies work through the actual authenticated Supabase client.
- Service-role credentials never reach the frontend.

## Dependencies
- Issues 1.2–1.5`),
  i('1.7','Issue 1.7 — Build multi-business isolation integration tests','M1 — Multi-business foundation',
    ['priority:critical','area:testing','area:security','type:feature'], ['1.1','1.2','1.3','1.4','1.5','1.6'],
`## Description
Create automated tests proving that separate businesses cannot access each other's information.

## Test scenario
- Owner A creates Business A.
- Owner B creates Business B.
- Worker A joins Business A.
- Worker B joins Business B.
- Both businesses create products, customers and transactions.

## Acceptance criteria
- Owner A sees only Business A records.
- Owner B sees only Business B records.
- Worker A cannot access Business B.
- Worker B cannot access Business A.
- Direct API requests cannot bypass RLS.
- Tests cover SELECT, INSERT, UPDATE and DELETE.
- Tests run automatically in CI.

## Dependencies
- Issues 1.1–1.6`),
  i('2.1','Issue 2.1 — Migrate existing inventory records to business ownership','M2 — Transaction integrity',
    ['priority:critical','area:database','type:migration'], ['M1'],
`## Description
Modify the existing inventory engine to associate all inventory data with the correct business. Design a reversible migration and backup strategy before migrating existing records.

## Tasks
- Add business ownership to products.
- Add business ownership to categories.
- Add business ownership to stock movements.
- Migrate existing records.
- Prevent cross-business product references.
- Preserve existing inventory quantities.

## Acceptance criteria
- Every product belongs to one business.
- Every stock movement belongs to one business.
- Existing data is preserved.
- No orphaned inventory records remain.
- Existing inventory tests continue passing.

## Dependencies
- M1 complete`),
  i('2.2','Issue 2.2 — Make sales business-specific','M2 — Transaction integrity',
    ['priority:critical','area:backend','type:feature'], ['2.1'],
`## Tasks
- Associate sales with businesses.
- Associate sale items with their parent sales.
- Validate product ownership during checkout.
- Attribute sales to authenticated staff.
- Scope sales queries by business.

## Acceptance criteria
- Sales cannot contain products from another business.
- Every sale has a valid business.
- Staff attribution comes from the authenticated session.
- Sales are isolated between businesses.

## Dependencies
- Issue 2.1`),
  i('2.3','Issue 2.3 — Implement atomic stock and sales transactions','M2 — Transaction integrity',
    ['priority:critical','area:backend','area:database','type:feature'], ['2.2'],
`## Tasks
- Move critical stock operations into PostgreSQL transactions.
- Prevent negative stock where prohibited.
- Ensure sale creation and stock deduction succeed or fail together.
- Handle concurrent sales.
- Maintain stock movement history.

## Acceptance criteria
- Failed sales do not deduct stock.
- Successful sales deduct stock exactly once.
- Concurrent sales cannot oversell available stock.
- Stock movements reconcile with inventory balances.
- Database transaction failures roll back correctly.

## Dependencies
- Issue 2.2`),
  i('2.4','Issue 2.4 — Implement duplicate transaction protection','M2 — Transaction integrity',
    ['priority:critical','area:backend','area:security','type:feature'], ['2.3'],
`## Tasks
- Introduce idempotency keys.
- Enforce unique transaction identifiers.
- Handle network retries.
- Prevent duplicate checkout submissions.

## Acceptance criteria
- Repeated requests with the same idempotency key create one sale.
- Retried requests return the original transaction result.
- Duplicate requests do not deduct stock twice.

## Dependencies
- Issue 2.3`),
  i('2.5','Issue 2.5 — Make purchases and suppliers business-specific','M2 — Transaction integrity',
    ['priority:critical','area:backend','type:feature'], ['2.4'],
`## Acceptance criteria
- Purchases belong to the correct business.
- Suppliers are business-specific.
- Purchase items reference valid business products.
- Receiving stock updates inventory correctly.
- Another business cannot access purchase records.

## Dependencies
- Issue 2.4`),
  i('2.6','Issue 2.6 — Make customer records business-specific','M2 — Transaction integrity',
    ['priority:critical','area:backend','type:feature'], ['2.5'],
`## Acceptance criteria
- Customers belong to a business.
- Customer history is business-specific.
- Customer records cannot leak between businesses.
- Sales reference customers from the same business.

## Dependencies
- Issue 2.5`),
  i('3.1','Issue 3.1 — Implement role-based access control','M3 — Staff and accountability',
    ['priority:high','area:security','area:backend','type:feature'], ['M2'],
`## Description
Create three default roles with permissions enforced by backend/database operations.

| Permission | Owner | Manager | Worker |
| --- | --- | --- | --- |
| View dashboard | ✓ | ✓ | Limited |
| Record sales | ✓ | ✓ | ✓ |
| Manage products | ✓ | ✓ | Limited |
| Manage purchases | ✓ | ✓ | — |
| View reports | ✓ | ✓ | — |
| Manage workers | ✓ | — | — |
| Business settings | ✓ | — | — |

## Acceptance criteria
- Roles are assigned per business membership.
- Permissions are enforced by backend/database operations.
- Workers cannot promote themselves.
- Owners cannot accidentally lose ownership.
- Unauthorized actions are rejected.
- Permission changes take effect without relying on frontend hiding.

## Dependencies
- M2 complete`),
  i('3.2','Issue 3.2 — Build staff management dashboard','M3 — Staff and accountability',
    ['priority:high','area:frontend','type:feature'], ['3.1'],
`## Acceptance criteria
- Owners can view staff members.
- Owners can invite workers.
- Owners can deactivate memberships.
- Owners can change permitted roles.
- Staff status is visible.
- Staff data is scoped to the current business.

## Dependencies
- Issue 3.1`),
  i('3.3','Issue 3.3 — Implement configurable permissions','M3 — Staff and accountability',
    ['priority:high','area:backend','type:feature'], ['3.2'],
`## Acceptance criteria
- Default roles are configurable.
- Permissions can be granted or revoked.
- Permission changes are persisted.
- Critical owner-only permissions remain protected.
- Permission changes are audited.

## Dependencies
- Issue 3.2`),
  i('3.4','Issue 3.4 — Build audit logs','M3 — Staff and accountability',
    ['priority:high','area:backend','area:frontend','type:feature'], ['3.3'],
`## Description
Record: product creation/modification, stock adjustments, sales creation/cancellation, purchase creation/receiving, staff invitations, role changes, business setting changes.

## Acceptance criteria
- Each event records the authenticated actor.
- Each event records the business.
- Events include timestamps.
- Audit records cannot be modified by ordinary workers.
- Owners can filter activity by staff member, action and date.
- Sensitive credentials and secrets are never logged.

## Dependencies
- Issue 3.3`),
  i('4.1','Issue 4.1 — Implement custom date-range reporting','M4 — Business reporting',
    ['priority:medium','area:backend','area:frontend','type:feature'], ['M2'],
`## Acceptance criteria
- Users can select start and end dates.
- Daily, weekly and monthly reports work.
- Reports use the current business timezone.
- Reports exclude other businesses' transactions.
- Empty date ranges display correctly.

## Dependencies
- M2 complete (can proceed after transaction data is business-scoped)`),
  i('4.2','Issue 4.2 — Implement sales and payment reports','M4 — Business reporting',
    ['priority:medium','area:backend','type:feature'], ['4.1'],
`## Acceptance criteria
- Total sales are calculated correctly.
- Cash sales are reported separately.
- M-Pesa sales are reported separately.
- Cancelled sales are handled correctly.
- Payment totals reconcile with underlying transactions.

## Dependencies
- Issue 4.1`),
  i('4.3','Issue 4.3 — Implement cost of goods sold and gross profit','M4 — Business reporting',
    ['priority:medium','area:backend','type:feature'], ['4.2'],
`## Acceptance criteria
- Cost of goods sold is calculated from appropriate inventory costs.
- Gross profit = net sales revenue minus cost of goods sold.
- Discounts and returns are handled correctly.
- Historical product costs are preserved.
- Reports do not incorrectly label gross profit as net profit.

## Dependencies
- Issue 4.2`),
  i('4.4','Issue 4.4 — Implement product performance and stock valuation','M4 — Business reporting',
    ['priority:medium','area:backend','type:feature'], ['4.3'],
`## Acceptance criteria
- Best-selling products can be identified.
- Slow-moving products can be identified.
- Stock valuation uses a documented costing method.
- Inventory reports are business-specific.
- Reports reconcile with inventory records.

## Dependencies
- Issue 4.3`),
  i('4.5','Issue 4.5 — Implement CSV report exports','M4 — Business reporting',
    ['priority:medium','area:frontend','type:feature'], ['4.4'],
`## Acceptance criteria
- Users can export sales reports.
- Users can export inventory reports.
- Users can export purchase reports.
- Exported data respects business permissions.
- CSV columns have consistent names and formats.

## Dependencies
- Issue 4.4`),
  i('5.1','Issue 5.1 — Resolve release-checker placeholders','M5 — Release and reliability',
    ['priority:high','type:bug','area:testing'], [],
`## Acceptance criteria
- All three existing release-checker placeholders are resolved.
- Release checks run successfully.
- No known critical release warnings remain.
- Results are documented.

## Dependencies
None (can start in parallel where safe).`),
  i('5.2','Issue 5.2 — Optimize JavaScript bundle','M5 — Release and reliability',
    ['priority:high','area:frontend','type:performance'], [],
`## Description
Reduce the existing 835 KB main JavaScript chunk. Do not set an arbitrary target without first examining bundle composition.

## Tasks
- Analyze bundle composition.
- Identify unnecessarily large dependencies.
- Implement route-level code splitting.
- Lazy-load non-critical screens.
- Remove unused dependencies.
- Optimize chart and reporting imports.

## Acceptance criteria
- Main JavaScript chunk is reduced.
- Initial page loading improves.
- Lazy-loaded pages work correctly.
- No existing features break.
- Bundle sizes are monitored in CI.

## Dependencies
None (can run in parallel).`),
  i('5.3','Issue 5.3 — Test Android and PWA functionality','M5 — Release and reliability',
    ['priority:high','area:testing','area:frontend'], [],
`## Acceptance criteria
- Application works on Android Chrome.
- PWA installation works.
- Navigation works on small screens.
- Forms are usable on mobile.
- No critical layout overflow exists.
- Session restoration works after reopening the application.

## Dependencies
None (can run in parallel).`),
  i('5.4','Issue 5.4 — Implement reliable offline behavior','M5 — Release and reliability',
    ['priority:high','area:frontend','area:backend','type:feature'], [],
`## Acceptance criteria
- Application handles network disconnections.
- Cached data is clearly identified.
- Unsynchronized operations are tracked.
- Reconnection does not duplicate transactions.
- Conflicting changes are handled safely.
- Users are informed when operations cannot be completed.

**Important:** Do not allow offline transactions to appear confirmed when they have not reached the authoritative server.

## Dependencies
None listed (coordinate with transaction/idempotency work in M2 where relevant).`),
  i('5.5','Issue 5.5 — Implement backup and restoration procedures','M5 — Release and reliability',
    ['priority:high','area:database','area:testing','type:feature'], ['M1'],
`## Acceptance criteria
- Database backup configuration is documented.
- Backup retention is defined.
- Restoration procedure is documented.
- Restoration is tested.
- Restored data maintains business relationships.
- Recovery procedures are documented.

## Dependencies
- M1 schema/foundation (backup strategy should align with multi-tenant schema).`),
  i('5.6','Issue 5.6 — Complete production security and deployment audit','M5 — Release and reliability',
    ['priority:high','area:security','area:backend','type:testing'], ['M1','M2','M3'],
`## Acceptance criteria
- HTTPS is enforced.
- Production secrets are protected.
- Authentication configuration is verified.
- RLS policies are tested.
- Database migrations are reproducible.
- Error responses do not expose sensitive information.
- Rate limiting protects sensitive endpoints.
- Dependencies are checked for known vulnerabilities.
- Production deployment passes smoke tests.

## Dependencies
- M1–M3 substantially complete (audit validates real controls).`)
];

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('issues', data.issues.length);
