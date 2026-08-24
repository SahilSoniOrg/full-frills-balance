# WP-7 exit audit

Status: complete

Compared to the originating architecture-audit risks (roadmap evidence index) against enforced ratchets on 2026-08-19.

## Metrics

| Check | Start of WP sequence | Now |
| --- | --- | --- |
| `unscoped_raw_query` | open | 0 |
| `presentation_model_import` | open | 0 |
| `direct_database_write` | many service writers | 21, named owners only |
| unsafe-type total | 183 | 61 with `ownersByPrefix` |
| feature barrel edges | loophole | 14 allowlisted; no deep imports |

## Remaining `database.write` owners

These are the commit owners, not leftover bypasses. Do not split by line count.

| File | Owner |
| --- | --- |
| `src/services/ledger/ledgerWriteService.ts` | journal/transaction commits |
| `src/services/AccountingRebuildService.ts` | balance rebuild |
| `src/services/integrity-service.ts` / `integrity/integrityMaintenance.ts` | repair |
| `src/services/audit-service.ts` | audit cleanup |
| `src/testing/e2eSeed.ts` / `smsTestHarness.ts` | test harnesses |

## Closed this package

- PlannedPaymentService façade deleted; callers use `src/services/planned-payment/*`
- Raw SQL goes through `RawSqlAdapter`
- App-shell, list, and form screens parse routes / pass view callbacks; feature hooks own navigation and telemetry
- Detox `e2e/specs` is the mobile E2E contract and has a dedicated tsconfig

## Not split

Ledger, rebuild, and integrity stay as single writers. A new coordinator class would duplicate `persistBatch` / `LedgerWriteService`.
