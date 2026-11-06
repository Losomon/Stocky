# Contributing to Stockly

## Workflow
- **One deliverable per issue**; use one feature branch per issue where practical.
- Branch from `main` (or the agreed integration branch): `git checkout -b feature/<issue-number>-short-name`.
- Every PR must **reference its issue** (e.g. `Closes #123`).
- **Security changes require tests.** Never merge when critical tests are failing.

## Before you start
- Check dependencies in the issue body/backlog (`scripts/stockly-backlog.json`, `docs/stockly-github-backlog.md`).
- Follow existing project conventions (React/TypeScript/Vite/Tailwind patterns already in the repo).

## Development
```powershell
npm install
npm run dev
npm run lint
npm test
```
Run the checks relevant to your change; fix lint/type/test failures before opening a PR.

## Pull requests
- Keep PRs focused on the linked issue.
- Describe what changed, how to verify, and any migration/backup impact.
- For database/auth/RLS/transaction changes, include or update tests proving isolation and correctness.
- Do not commit secrets, service-role keys, or `.env` credentials.

## Multi-tenant / security reminders
- Do not treat frontend-only hiding as security. Business data isolation must be enforced by the database (RLS/policies) and authenticated backend operations.
- Sales/stock operations that must be consistent should use atomic database transactions and idempotency where specified.
