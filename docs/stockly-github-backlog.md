# Stockly — GitHub development issue backlog (ready to create)

Repo: `DanielNju/stock-managment` (source of truth: `scripts/stockly-backlog.json`)

## Milestones
| Milestone | Scope | Priority |
| --- | --- | --- |
| M1 — Multi-business foundation | Supabase, multi-tenant schema, auth, business/membership, invitations, RLS, isolation tests | Critical |
| M2 — Transaction integrity | Business-owned inventory/sales/purchases/customers, atomic stock/sales, idempotency | Critical |
| M3 — Staff and accountability | RBAC, staff dashboard, configurable permissions, audit logs | High |
| M4 — Business reporting | Date-range, sales/payment, COGS/gross profit, performance/valuation, CSV exports | Medium |
| M5 — Release and reliability | Release checks, bundle, Android/PWA, offline, backup/restore, security/deployment audit | High |

## Recommended labels
`priority:critical`, `priority:high`, `priority:medium`, `area:backend`, `area:frontend`, `area:database`, `area:security`, `area:testing`, `type:feature`, `type:bug`, `type:refactor`, `type:migration`, `type:performance`

## Issues (28)
1.1–1.7 M1 foundation/security; 2.1–2.6 M2 transactions; 3.1–3.4 M3 staff/accountability; 4.1–4.5 M4 reporting; 5.1–5.6 M5 release/reliability. Full titles, bodies, labels, milestones, and dependencies are in `scripts/stockly-backlog.json`.

## Create on GitHub
### Option A — GitHub CLI (install + auth on your machine)
```powershell
winget install --id GitHub.cli
gh auth login
# then run a gh-based creator if you add one, OR use Option B with a token
```

### Option B — API script (recommended from this repo)
```powershell
# Fine-grained PAT: Issues read/write on DanielNju/stock-managment (or classic PAT with repo scope)
$env:GITHUB_TOKEN = "<token>"
powershell -ExecutionPolicy Bypass -File scripts/push-stockly-backlog.ps1
# Dry run (no writes): add -DryRun
```

The script is idempotent by **title** for labels/milestones/issues (skips existing). It does not create cross-issue dependency links; dependencies are recorded in each issue body.

## Project rules (from backlog)
- One deliverable per issue, one feature branch per issue where practical, PR references issue.
- Security changes require tests; never merge failing critical tests.
- Before tenant migration: reversible migration + backup strategy (Issue 2.1 note).
- M1 complete only when two businesses/workers are isolated and automated DB tests prove no cross-business access.

## Regenerate JSON
```powershell
node scripts/generate-stockly-backlog.cjs
```
