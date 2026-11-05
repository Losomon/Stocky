# Stockly

Offline-first stock management for small shops. It does not just record stock. It tells the owner what needs attention.

> **The name is a placeholder.** Change it in `brand.json` (not in the code). Other inventory apps called "Stockly" already exist on Google Play, so pick a distinctive name before you publish.
> **Status:** v0.8.0. Feature-complete for a first release and **ready to be packaged for Google Play** (see `store/PLAY-STORE-GUIDE.md`). It starts empty for a real shop, has backup and restore, and installs as an app. It still has no server copy or sync, so every phone holds its own data. Optional Supabase sign-in adds accounts, per-business isolation and worker invitations on top of the local store.

---

## What it does

The app answers three questions:

1. **What do I have?** Current stock and stock value.
2. **What am I losing?** Stock that does not match a count, and damaged or missing stock.
3. **What needs my attention?** Low and out-of-stock products, discrepancies, and slow-moving stock.

Every stock change is recorded as a **movement** (a sale, a purchase, an adjustment, damage or a count) with the person who made it. Stock is never typed in directly. It is calculated from the movements, so you can always see where it went.

## Current status

| Area | State |
|---|---|
| Dashboard (counters, sales chart, Needs attention, Recent activity) | Built, runs on real sales and counts |
| Sales: cart, cash or M-Pesa (recorded manually), receipt, history, cancel with stock returned | Built |
| Inventory: stock list and **stock count** with reasons | Built |
| Products: list, search and filters, add, edit, details, archive, delete (only with no history) | Built and tested |
| Categories: create, rename, delete (blocked while products use them) | Built and tested |
| Product validation: required name and SKU, unique SKU and barcode, no negative prices or minimums, whole-number rules | Built and tested |
| Sale records with prices frozen at sale time, stock validation, duplicate protection | Built and tested |
| Atomic writes (a sale saves completely or not at all) and an audit log (stored, no screen yet) | Built and tested |
| Local data (IndexedDB via Dexie), upgrade from the v0.1 demo database | Built and tested |
| Installable PWA with service worker | Configured (production build only) |
| Suppliers: add, edit, archive, delete (only with no purchases), purchase history and totals | Built and tested |
| Purchases: draft, ordered, partial and full receiving, cancel, list with search and filters | Built and tested |
| Receiving: partial deliveries, no over-receiving, retry-proof, all-or-nothing | Built and tested |
| Dashboard: summary cards (today's sales, estimated gross profit, inventory value, low stock), prioritised Needs attention, sales and profit chart (7 or 30 days), top products by sales, profit or units, stock analysis tables (restock, slow-moving, value by category), filterable activity feed | Built, unit-tested and browser-tested |
| Slow-moving stock: dashboard row leads to a filtered Inventory list with days since last sale; new products are not flagged | Built and browser-tested |
| "Saved on this device only" header, offline indicator, demo banner on every screen, Settings page explaining where data lives, confirmed reset | Built and browser-tested |
| First run: setup screen (shop name, your name) starts empty; demo data only if asked | Built and browser-tested |
| Backup and restore: one file with everything, validated before it replaces anything, safe erase (type DELETE), last-backup reminder | Built, unit-tested and browser-tested |
| Store readiness: complete manifest, icons incl. maskable, screenshots, privacy policy page, release checker, store assets and listing text | Built; Chrome installability and offline verified |
| Customers: add, edit, archive, delete (only with no purchases), optional on any sale, purchase history, total spent, average sale, last purchase | Built and tested |
| Settings: business details, staff list, who is using this device (recorded on every sale, count and delivery), data and storage explanation, confirmed reset. Avatar dropdown in the header for switching person, Settings, backup and privacy | Built and tested |
| Sign-in, roles and business isolation | Wired against Supabase Auth: sign up, sign in, sign out, owner business creation, worker invitations, memberships and roles. Every cloud table is tenant-scoped by `business_id` and protected by database-level RLS (see [SUPABASE-ARCHITECTURE.md](./SUPABASE-ARCHITECTURE.md)). When Supabase is not configured, the app stays fully local and offline exactly as before. |
| Sync and backend API writes | Not active. Local-only storage; direct cloud table writes remain revoked by RLS until transaction-safe RPCs exist (see [SUPABASE-ARCHITECTURE.md](./SUPABASE-ARCHITECTURE.md)). |

## Quick start

Requires **Node.js 20 or newer**.

```bash
npm install
npm run dev        # development server
```

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check, then produce a production build in `dist/` |
| `npm test` | Run the engine, storage, analytics and colour-contrast tests |
| `node e2e/phone-checks.mjs` | Phone-size browser checks (needs Playwright, see the top of the file): offline sales, reopen, stock arithmetic, slow stock, data messaging |
| `npm run preview` | Serve the production build. **Use this to test install and offline**, because the service worker is only generated in the production build |

The app seeds demo data into your browser on first load. The **New sale (demo)** button adds a real sale movement, and **Reset demo data** at the bottom of the page restores the starting data.

## Tech stack

- React 18, TypeScript, Vite
- Tailwind CSS v4 (design tokens mapped into the theme)
- React Router
- Dexie (IndexedDB) for local storage
- vite-plugin-pwa for the service worker and manifest
- Lucide icons, Recharts
- Supabase Auth + PostgreSQL (optional cloud system of record; configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, see `.env.example`)

## How it works

```text
Sale ──► Sale items (price and cost frozen at sale time)
  │
  └──► Stock movements ──► Inventory calculation ──► Dashboard
Stock count ──► Count record + movement for the difference
Every action ──► Audit entry
```

- **Business analysis** (`src/lib/analytics.ts`, pure functions) is worked out from the actual records. **Estimated gross profit** = sales minus the cost price saved on each sale item when it was sold, so later cost changes don't rewrite it and cancelled sales are excluded. It is an estimate: it ignores rent, wages and other expenses, and uses the product's recorded cost, not the cost of the particular delivery.
- **Restock suggestions** are a simple rule, not a forecast: enough for 14 days at the last two weeks' average daily sales, plus the product's minimum, less stock and less what is already on order.
- **Needs attention** shows each kind (out or low, count shortages, purchases not fully received, slow stock) so one kind can't push another off the list.
- Archived products are left out of inventory value, alerts and restock suggestions.
- **Customers** are optional on a sale (walk-in sales need no name). A customer's totals count completed sales only, so a cancelled sale drops out. The same Kenyan phone number written as `0712…`, `+254 712…` or `254712…` counts as one number, so it can't be added twice. Two people may share a name (the app warns). A customer with purchases can be archived but not deleted.
- **Staff:** the people list lives in Settings, and the device is set to one of them. Every sale, count and delivery made on that device is recorded under that name. There are no passwords yet, so anyone using the app can switch, and a name can't be changed once created (past records keep the name they were made under). The first person on an older database is created from the names already on its records.
- A sale is **validated** (whole quantities above zero, no overselling) and saved with its items, movements and audit entry in **one transaction**, so it saves completely or not at all.
- Prices are copied onto each sale item. Changing a product price later does not change past sales.
- Cancelling a sale does not delete it. It marks the sale cancelled and adds `return` movements that put the stock back.
- **Products never store stock.** The number on a product page comes from its movements. Opening stock entered when adding a product becomes an `opening` movement.
- Editing a product changes the product only. Sales keep the price they were made at, and price or cost changes are written to the audit log with the old and new values.
- A product with any stock or sales history can be **archived** but not deleted. Archived products can't be sold and don't raise alerts.
- **Creating a purchase never changes stock. Receiving does.** A delivery saves its receipt, received quantities, one stock movement per line and an audit entry together or not at all. Each purchase line keeps the cost it was ordered at.
- "Partially received" and "Received" are worked out from the receipts, not stored, so they can't drift out of step with the stock.
- You can't receive more than is outstanding, and a delivery's ID is reused on retry, so tapping twice (or a lost connection) can't add the stock twice.
- A purchase with any received stock can't be cancelled. Stock never disappears silently.
- Suppliers with purchase history can be archived but not deleted. Archived suppliers still show on old purchases.
- Product IDs are UUIDs, so two phones can add products offline without clashing.
- A stock count compares the shelf with the system and records the difference with a reason.
- Every record carries a `businessId` (a placeholder for now), ready for multi-business isolation.

- `src/lib/engine.ts` is **pure logic**: no UI, no storage. It is designed to run unchanged once a backend exists.
- `src/lib/store.ts` loads and saves data. If IndexedDB is blocked, it falls back to memory and the header says so.
- Business logic stays out of components. Any number shown on screen is computed in the engine.

### Planned path

```text
Today:   IndexedDB  →  engine  →  UI
Later:   IndexedDB  →  sync queue  →  API  →  PostgreSQL
                     same engine, same UI
```

Because stock is a list of movements, syncing must preserve the ledger and transaction boundaries; it is not safe to merge arbitrary table snapshots. See [SUPABASE-ARCHITECTURE.md](./SUPABASE-ARCHITECTURE.md) for the selected backend, ownership model, and staged migration gates.

## Project structure

```text
src/
├── config.ts            Product name
├── index.css            Design tokens and Tailwind theme
├── App.tsx              Routes
├── main.tsx
├── components/
│   ├── AppShell.tsx     Sidebar, header, bottom navigation
│   ├── ui.tsx           Card, Badge, buttons, empty state
│   └── dashboard/       Summary, Attention, Trends, TopProducts, StockAnalysis, ActivityFeed
├── pages/
│   ├── Dashboard.tsx    Composes the dashboard sections
│   ├── Sales.tsx        New sale, receipt, history, cancel
│   ├── Inventory.tsx    Stock list and stock count
│   ├── Products.tsx     Product list, filters, categories
│   ├── ProductForm.tsx  Add and edit product
│   ├── ProductDetail.tsx Stock, value, movements, sales, archive/delete
│   ├── Purchases.tsx    Purchase list and suppliers tab
│   ├── PurchaseForm.tsx Create or edit a draft purchase
│   ├── PurchaseDetail.tsx Lines, receive stock, deliveries, cancel
│   ├── SupplierForm.tsx
│   ├── SupplierDetail.tsx
│   ├── Customers.tsx, CustomerForm.tsx, CustomerDetail.tsx
│   ├── Settings.tsx     Business, staff, device user, data, reset
│   └── Placeholder.tsx  Stand-in for unbuilt screens
└── lib/
    ├── engine.ts        Sales, counts, validation, stock rules (pure)
    ├── people.ts        Customers, staff, business profile rules (pure)
    ├── analytics.ts     Profit, trends, top products, restock, attention, activity (pure)
    ├── store.ts         Dexie database, atomic writes, data hook
    ├── seed.ts          Demo data
    ├── format.ts        Money and time formatting
    └── *.test.ts        Engine and storage tests
public/                  Icons
vite.config.ts           Vite, Tailwind and PWA setup
```

## Navigation (V1)

Dashboard · Sales · Products · Inventory · Purchases · Customers · Settings

Suppliers are managed inside Purchases. Reports are deferred. Alerts appear in Dashboard → Needs attention.

## Design

See **[DESIGN.md](./DESIGN.md)** for the design system: tokens, contrast figures, layout, component rules and known issues.

The dashboard borrows layout patterns from the Innap admin template. This project contains none of Innap's code, CSS or assets. Do not copy them in unless you hold the right license (an Extended License is needed for a product you charge for).

## Known limitations

- Data lives only in this browser (IndexedDB). It is not synced or backed up, and clearing site data or uninstalling erases it. The app says so in the header, a banner and Settings. The browser may still clear it when space is low; the app asks it not to and Settings shows whether that was granted. **Back up regularly:** Settings > Download backup makes one file with everything, and Restore brings it back on any phone.
- "Who did it" is only as trustworthy as the person who set the device: there is no sign-in or password, so anyone can switch the device user in Settings.
- Count mismatches shown are shortages only (surplus counts are recorded but not flagged). The attention list has no due dates, so "late" deliveries are shown by age only.
- The dashboard page is long on a phone. Sections are ordered by urgency, but there is no way to hide or reorder them yet.
- Quantities are whole numbers only, so the unit list is whole units (piece, pack, bottle, carton, bag, box, dozen). Weighed units such as kg and litres need decimal quantities and are not offered yet.
- Receipt numbers count up on one device. With several devices they could collide, so the server will need to assign them.
- Any signed-in-looking user can cancel a sale or adjust stock on a device. Roles and permissions exist with Supabase authentication (owner/admin/manager/cashier, enforced server-side by RLS and RPCs for cloud data); local device use is not yet role-restricted.
- No customer credit, balances or payments. Customers are records and purchase history only, on purpose, until research shows credit is needed. The sale already stores the customer, so credit can be added on top.
- Upgrading from an earlier version clears the browser's demo data and reloads fresh demo data (v0.3 changed product IDs). Once real data exists, upgrades will need proper migrations.
- Products have no images, variants or multiple suppliers yet.
- Receiving does not change a product's cost price. Whether to use the latest cost or an average is still to be decided.
- A partly delivered purchase can't be closed short or cancelled yet, and returning stock to a supplier isn't built. Both need their own steps so stock never vanishes silently.
- No supplier balances, payments or accounts payable (kept out on purpose until research shows they matter).
- Only a draft purchase can be edited. An ordered purchase's lines are locked.
- The PWA icons are placeholders. Replace them in `public/` before launch.
- The bundle is about 680 KB (203 KB gzipped). Split by route as screens are added.
- No server copy, multi-device sync or multi-business cloud isolation yet. Local-only storage; optional Supabase sign-in establishes per-business isolation at the database level. Real shops can use it locally, but only with regular backups.

## Roadmap

1. ~~Sales screen~~ and ~~stock count~~ (done)
2. ~~Products~~ and ~~Purchases with suppliers~~ (done)
3. Customers and credit sales; close-short and supplier returns
4. Working search, and an audit log screen
5. Database design and offline sync rules
6. Backend API, PostgreSQL, authentication, roles and per-business data isolation
7. Interviews with shop owners to confirm priorities. **Research decides what stays in V1.**

## License

Not yet chosen.

## Releasing to Google Play

Everything is in `store/`. Start with **`store/PLAY-STORE-GUIDE.md`**. In short:

1. Edit `brand.json`: name, `packageId` (permanent once uploaded), developer name, contact email.
2. `npm run build` (also writes `public/privacy.html` from `brand.json`), then `npm run check:release` to see what is still missing.
3. Re-take the store images if you changed the name: `python3 scripts/make-icons.py` and `node scripts/make-store-assets.mjs http://localhost:4176` (needs Playwright).
4. Deploy, build the Android package at pwabuilder.com, add `/.well-known/assetlinks.json`, and follow the Play Console steps in the guide.

What I could not do from here: build the `.aab`, create the Play account, or test on a real phone or on Play.

## Deploying (Vercel or any static host)

- Build command `npm run build`, output folder `dist`.
- `vercel.json` rewrites every path to `index.html` (real files such as `/privacy.html` and `/.well-known/…` are still served as files) and stops the service worker and manifest from being cached. Without it, opening or refreshing a deep link such as `/customers` returns a 404, because only `index.html` exists on the server. After deploying, open `/customers` directly in a new tab to confirm.
- The app updates itself in the background. After you deploy a new version, people may need to close and reopen the app once, or reload twice, to get it.
- Each phone keeps its own data. Redeploying does not touch what is already stored on a phone, and upgrades add new tables without clearing the old ones.
