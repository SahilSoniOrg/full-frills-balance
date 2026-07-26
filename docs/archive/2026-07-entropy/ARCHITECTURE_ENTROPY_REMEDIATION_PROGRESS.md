# Architecture entropy remediation — progress (2026-07-27)

> **Snapshot.** Remediation for this audit is complete on `main`. For current doc
> hierarchy, see [README.md](README.md). For ongoing eng queue, see
> [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

Tracking against `ARCHITECTURE_ENTROPY_REMEDIATION_PLAN_2026-07-27.md`. Status: **complete** for planned commits; optional historical doc cleanup only.

## Grill round 2 decisions (locked)

| Q | Decision |
| --- | --- |
| Q1 | **A** — Delete `AccountService` / `accountDomainService`; tests call command modules directly. |
| Q2 | **B** — STS: remove `observeSafeToSpend` public API; tests use `forWorkplace().watch()`. |
| Q3 | **C** — Dual card-adapter import paths documented in `CONVENTIONS.md`. |
| Q4 | **B** — Refresh entropy audit status + PR checklist for `check:architecture`. |
| Q5 | **C** — Unsafe-type baseline **237** (−5 vs prior 242); **−5 per calendar month** policy in CONVENTIONS. |

## Done

All plan commits **1–52** substantially delivered on `main` (see git log from `3ee1327a`). Highlights: journal intent modules, import canonical + adapter, account commands/queries, report snapshot, STS split, SMS/journal/account form policy modules, CI ratchets.

## Verify locally

```bash
bun run typecheck
npx jest --coverage=false
bun run check:architecture
```

Unsafe types: **201/237** (ratchet OK).

## ADRs

- `docs/adr/0008-account-mutations-via-commands.md`
- `docs/adr/0009-import-persistence-adapter.md`
