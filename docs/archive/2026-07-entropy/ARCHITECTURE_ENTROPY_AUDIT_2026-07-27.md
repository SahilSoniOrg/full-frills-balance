# Architecture Entropy Audit — 2026-07-27

> **Point-in-time audit.** See [docs/README.md](README.md) for current doc hierarchy.

## Remediation status (updated 2026-07-27, grill round 2)

Tracked in `ARCHITECTURE_ENTROPY_REMEDIATION_PROGRESS.md`. Finding-level status:

| Finding | Status | Notes |
| --- | --- | --- |
| P0 — single owner for planned-payment commands | **Resolved** | Commands own create/update/delete/schedule; hooks build inputs and call the command interface. |
| P0 — stop preserving god-repository APIs (`JournalRepository`) | **Resolved for journal** | 39-method façade deleted; callers use `journal*Module` intent modules; CI guards re-appearance. |
| P0 — account/transaction repository inventory | **Resolved** | `docs/ACCOUNT_TRANSACTION_REPOSITORY_INTENT_INVENTORY.md`; feature reads via `accountQueries`. |
| P1 — restore domain→UI dependency direction | **Resolved** | Service-owned timeline DTOs + feature/adapters; service→UI import lint in place. |
| P1 — narrow Safe-to-Spend responsibilities | **Resolved** | Input acquisition, projection, and snapshot writer split; public API is `forWorkplace().watch()` / `watchHeadline()` / `preWarm()` only. |
| P1 — treat imported data as untrusted boundary | **Substantially resolved** | `CanonicalImport`, `importRun`, persistence adapter quarantine; plugin seams may still use pragmatic typing per ADR-0009. |
| P2 — collapse trivial import facades | **Resolved** | `ImportRunner` deleted; named-phase `ImportRun`. |
| P2 — split account lifecycle by use case | **Resolved** | Command modules + `accountQueries`; `AccountService` delegator **deleted** (grill Q1-A). |
| P2 — report/read contracts | **Substantially resolved** | `ReportSnapshot` is the reports UI contract; account-period deltas shared via `reportingPeriodLoader` with `getIncomeVsExpense`. Legacy per-chart service methods removed. |
| P2 — view-model policy extraction | **Substantially resolved** | SMS rule policy, journal editor balance policy, account form validation policy; large VMs remain but policy is testable. |
| P2 — documentation drift | **In progress** | This audit updated; `docs/codebase-design/AUDIT.md` remains historical—prefer this file + CONVENTIONS for active guardrails. |

## Verdict (original audit)

The codebase has a strong accounting core and several genuinely deep modules: the ledger write path, balance calculation, import parsers, transaction-ingestion pipeline, and simulation engines all hide substantial complexity behind useful boundaries.

The architecture was **accumulating entropy at application boundaries**. The remediation plan (52 commits) addressed the highest-risk expansion patterns. **Residual risk** is mostly large view-models and historical docs—not unowned repository gateways.

For the full original findings table and narrative, see git history of this file before the status table above, or [ARCHITECTURE_ENTROPY_REMEDIATION_PLAN_2026-07-27.md](ARCHITECTURE_ENTROPY_REMEDIATION_PLAN_2026-07-27.md).

## Completion checklist (grill round 2)

- [x] Account mutations via commands (no `AccountService` façade)
- [x] Journal façade deleted with CI guard
- [x] Import canonical seam + persistence adapter
- [x] STS module split + public handle only
- [x] Report snapshot + shared `reportingPeriodLoader` (account-period parity with accounts list)
- [x] `bun run check:architecture` in PR checklist (`docs/CONVENTIONS.md`)
- [x] Unsafe-type baseline ratchet policy (−5 / month)
- [ ] Optional: refresh `docs/codebase-design/AUDIT.md` strikethroughs (out of scope unless requested)
