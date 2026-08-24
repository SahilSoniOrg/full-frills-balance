# Persistence Ownership Inventory

Status: WP-4 ownership inventory complete; disposable rebuild delivery restored; adapter contract strengthened; native device proof remains open
Snapshot: `0ff90512`
Scope: production persistence primitives, privileged adapter access, cross-domain mutation workflows, and the tests that define their contracts

## Audit coverage

- Tracked TypeScript/TSX source files mechanically scanned: 1,281; current production `app/` + `src/` ratchet scope: 940 files.
- Production files containing candidate persistence primitives: 50; analyzed: 50; blocked: 0.
- Production files containing privileged/raw access candidates: 16; analyzed: 16; blocked: 0.
- Direct database write occurrences ratcheted: 3 across 2 approved test-harness files; no service-owned occurrences remain in the current baseline.
- Service/command model preparation, update, and private raw-access occurrences ratcheted: 0 across 0 files.
- Relevant persistence-contract test files inspected: 30 in the original sweep; six follow-up adapter/workflow integration files are now added or extended.
- Schema migrations inspected: versions 2 through 31, including 71 `unsafeExecuteSql` calls. The experimental v31-to-v32 rebuild-intent migration was removed.
- Search families: `database.(write|batch|action)`, model `create`/`update`/`prepare*`/delete calls, `getRawAdapter`, `queryRaw`, `unsafeQueryRaw`, `_raw`, `_setRaw`, `_cache`, `_notify`, and all production callers of the resulting mutation APIs.

False positives were classified and excluded: React state setters, chart/animation `.update` calls, and the non-Watermelon preferences store. Tests, fixtures, and `src/testing` helpers are evidence or approved test infrastructure, not application transaction owners.

Inventory status: **COMPLETE**. No mutation path found by the scoped primitive and caller sweeps remains unclassified. All service/command model preparation, model updates, and private raw reads identified by the ratchet now live behind repository or infrastructure seams; the ratchet is zero and rejects regression. Rebuild delivery is an after-commit MMKV trigger for disposable projections. Real transaction-owner coverage is now present; only native SQLite/JSI device proof remains outside this environment.

## Verdict

**Fixable.** The codebase has real repositories and several good atomic batches. The failure is competing ownership: services, repositories, and command modules can each open transactions, while audit, rebuild, cache, preferences, and external SMS acknowledgement are inconsistently inside or outside the durable commit.

The highest-risk remaining gaps are:

1. The staged-import raw swap now has fault injection through the real raw-adapter extraction path, with savepoint restoration and cache-notification assertions; native SQLite/JSI behavior and device cache coherence remain unproved.
2. The real Loki workflow covers staging failure and target preservation, but LokiJS can expose adapter-specific partial state on later batch failure. Pending MMKV rebuild work may be lost on process death by design.
3. The service/command model-access baseline is now zero; the ratchet prevents service-owned persistence mechanics from returning.

The durability sweep traced 13 production rebuild-enqueue producers across ledger create/reversal/update/lifecycle, journal bulk operations, account hierarchy/create/merge, and SMS scan. The current producers enqueue only after their database commit through `RebuildQueueService`; the MMKV queue coalesces duplicate projection work, retries in-process, and can be superseded by startup integrity or a manual workplace/account rebuild. No durable rebuild table is required because journals and transactions remain the source of truth.

## Target ownership model

Services should validate and express domain intent. Repositories should load records and prepare table-local operations. A named transaction coordinator should own each cross-table business commit. External or derived effects should run through an explicit after-commit contract. Disposable projection triggers may use MMKV; only a future mandatory, non-reconstructible workflow would justify a durable outbox.

```text
feature / background trigger
  -> domain command service (validate and build intent)
  -> named transaction coordinator (one durable commit owner)
       -> repositories (scoped reads + prepared table-local operations)
       -> audit operation in the same batch when audit is part of the contract
  -> after-commit effects (rebuild trigger, analytics, MMKV cache, notifications)
```

No feature or presentation file directly opens a Watermelon write. The leakage begins in service and command modules.

## Mutation-path inventory

### 1. Journal and ledger mutations

| Path                                 | Initiator                                                          | Tables                                                                  | Current transaction owner                                                                                                                                                   | Audit/rebuild behavior                                                                                                   | Rollback gap                                                                                                                                | Recommended owner                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Create one/many                      | Journal feature, account opening/adjustment, planned payments, SMS | `journals`, `transactions`, optional `journal_metadata`, `audit_logs` | `LedgerWriteService` at `src/services/ledger/ledgerWriteService.ts:86-136` using preparers at `src/data/repositories/journal/journalWriteRepository.ts:64-124` | Audit is batched; rebuild is enqueued after commit; post-commit work is limited to projection/cache/analytics effects | Business rows roll back together; a lost rebuild trigger can leave derived balances stale until the next trigger | `JournalTransactionCoordinator.create/createMany` |
| Update journal and legs              | Journal edit                                                       | `journals`, `transactions`, `journal_metadata`, `audit_logs`           | `JournalWriteRepository` owns the writer at `journalWriteRepository.ts:154-267` | Audit is batched; rebuild is enqueued after commit | Business rows roll back together; derived projection may remain stale until retriggered | `JournalTransactionCoordinator.update` |
| Delete/recover                       | Journal actions                                                    | `journals`, `transactions`, `audit_logs`                               | `LedgerWriteService` at `ledgerWriteService.ts:205-288` | Audit is batched; rebuild is enqueued after commit | Business rows roll back together; derived projection may remain stale until retriggered | `JournalTransactionCoordinator.delete/recover` |
| Post/revert planned status           | Journal/planned-payment actions                                    | `journal_metadata`, `journals`, `transactions`, `audit_logs`           | `LedgerWriteService` at `ledgerWriteService.ts:291-425` | Audit is batched; rebuild is enqueued after commit | Business rows roll back together; derived projection may remain stale until retriggered | `JournalTransactionCoordinator.post/revert` |
| Reversal                             | Journal action                                                     | new reversal `journals`/`transactions`/`audit_logs`, original `journal` | `LedgerWriteService.createReversalJournal` at `ledgerWriteService.ts` using `JournalWriteRepository.persistReversal` in one writer | Audit is batched; rebuild is enqueued after commit | Business rows roll back together; derived projection may remain stale until retriggered | Keep `LedgerWriteService.createReversalJournal` as owner until a named coordinator exists |
| Bulk rename                          | Journal list                                                       | `journals`                                                              | `JournalWriteRepository.bulkUpdateDescriptions` at `journalWriteRepository.ts:458-484`; caller `src/services/journal/journalBulkCommands.ts:59-88`                          | No audit; no rebuild needed                                                                                              | Atomic rows, but no audit contract                                                                                                          | `JournalTransactionCoordinator.bulkRename` if renames are auditable; otherwise retain repository ownership explicitly         |
| Bulk duplicate/merge/delete/reassign | Journal list                                                       | `journals`, `transactions`, optional `journal_metadata`                | Repository methods at `journalWriteRepository.ts:489-710`; callers at `journalBulkCommands.ts:98-136`, `291-321`, `448-508`, `555-566` | Rebuild is enqueued after the bulk mutation; no audit rows | Business rows roll back together; merge/delete/reassign still bypass a canonical audit policy and projection refresh can be retriggered | `JournalBulkTransactionCoordinator` |

`JournalWriteRepository` also exposes unused production mutation APIs: `createJournalWithTransactions` (`:127`), `updateJournalStatus` (`:270`), `softDeleteJournal` (`:288`), and `replaceJournalWithReversal` (`:347`). No production caller exists. Delete or make them coordinator-private before adding another write path.

Existing evidence: `src/services/ledger/__tests__/ledgerWriteService.write.test.ts:61-160`, `src/services/ledger/__tests__/ledgerWriteService.lifecycle.test.ts:74-289`, and `src/services/journal/__tests__/journalBulkCommands.test.ts:63-291`. After-commit rebuild enqueue and failed-writer behavior are covered by focused tests; native writer rollback remains unproven.

### 2. Account mutations

| Path                             | Initiator                                       | Tables                                                                                                                                                           | Current transaction owner                                                                                                                                                                           | Audit/rebuild behavior                                                                                                                  | Rollback gap                                                                                                                                                                                                  | Recommended owner                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create, optional opening balance | Account form, onboarding, system-account lookup | `accounts`, optional `account_metadata`, `audit_logs`; optionally opening-balances equity plus `journals`/`transactions`/ledger audit | `AccountRepository.persistCreatedAccount` at `src/data/repositories/AccountRepository.ts`; command intent at `src/services/accounts/accountCommands.ts` | Account CREATE audit is batched; affected projection is enqueued after commit; opening journal is a follow-up batch with its own trigger | Business rows roll back together. `getOpeningBalancesAccountId` / balance-correction lookup can still create equity in a separate write when used outside `createAccount` | Keep `AccountRepository.persistCreatedAccount` as owner until a named coordinator exists |
| Update/order/reconcile           | Account forms, list reorder, reconciliation     | `accounts`, optional `account_metadata`, `audit_logs` | Detail updates use `AccountRepository.update`; hierarchy moves use `AccountTreeTransactionCoordinator` at `src/data/repositories/account/AccountTreeTransactionCoordinator.ts` with receipt restore | Account UPDATE audit is batched; type-change rebuild is enqueued after commit; tree undo audits restore in the same batch | Business rows roll back together; derived projection may remain stale until retriggered | Keep repository/coordinator ownership |
| Bulk update                      | Account list/hierarchy                          | `accounts`, `account_metadata`, `audit_logs`                           | Command prepares ops; `persistBatch` at `src/data/repositories/persistBatch.ts` owns the writer | Audit is batched; any type-change rebuild is enqueued after commit | Business rows roll back together; derived projection may remain stale until retriggered | Keep `persistBatch` as owner |
| Archive/unarchive                | Account list/archive modal                      | `accounts`, `audit_logs`                                                                                                                                         | Command prepares ops; `persistBatch` owns the writer                                                                                                                                                | Audit is batched; cache invalidation follows commit                                                                                     | Cache invalidation failure leaves stale presentation state                                                                                                                                                    | Keep `persistBatch` as owner with after-commit cache invalidation                                                                                                 |
| Delete/recover                   | Account actions/audit revert                    | `accounts`, `audit_logs`                                                                                                                                         | `AccountRepository.delete` / `recover` with audit `extraOps`                                                                                                                                        | Audit is batched with the row                                                                                                           | Durable rows roll back together                                                                                                                                                                               | Keep repository delete/recover as owner                                                                                                                           |
| Merge accounts                   | Account merge action                            | `transactions`, `planned_payments`, `transaction_auto_post_rules`, `budget_scopes`, `budgets`, `accounts`, `account_metadata`, `balance_snapshots`, `audit_logs` | Command preloads and repositories prepare outside the writer; `persistBatch` commits rewrite + audit | Audit is in the same batch as the rewrite; affected projections are enqueued after commit | Business rows roll back together; named coordinator consolidation is deferred and derived projections can be retriggered | Keep `persistBatch` as owner until a named coordinator exists |
| Balance adjustment               | Account details/form                            | ledger tables                                                                                                                                                    | Delegates correctly to ledger at `src/services/accounts/accountAdjustCommands.ts:21-90`                                                                                                             | Ledger audit/rebuild policy applies                                                                                                     | No separate account mutation; retain as domain command                                                                                                                                                        | `JournalTransactionCoordinator` remains owner                                                                                                                     |

Merge preparers are repository-owned across `src/data/repositories/account/AccountMergeOperations.ts:17-100`, `src/data/repositories/TransactionWriteRepository.ts`, `src/data/repositories/PlannedPaymentRepository.ts`, `src/data/repositories/BudgetRepository.ts`, `src/data/repositories/TransactionAutoPostRuleRepository.ts:142-162`, and `src/data/repositories/BalanceSnapshotRepository.ts:151-159`. Account merge remains the cross-domain batch owner; services supply intent and repository preparation only.

Existing evidence: `src/services/accounts/__tests__/accountCommands.integration.test.ts:37-213` and `src/services/accounts/__tests__/accountArchiveCommands.integration.test.ts:15-204`. They prove aggregate outcomes but do not inject audit, rebuild, or mid-merge failure.

### 3. Budget mutations

| Path                  | Initiator            | Tables                     | Current transaction owner                                                                                                               | Side effects/gap                                                                            | Recommended owner                                                                                      |
| --------------------- | -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Create/update/delete  | Budget forms/details | `budgets`, `budget_scopes` | `BudgetRepository` at `src/data/repositories/BudgetRepository.ts:84-190`                                                                | Budget and scopes are correctly batched; analytics is post-commit. No audit contract exists | Retain `BudgetRepository`; decide explicitly whether budgets require audit                             |
| Account-merge rewrite | Account merge        | same tables            | Repository preparation in `BudgetRepository`, `PlannedPaymentRepository`, `TransactionWriteRepository`, and existing merge repositories; parent account-merge command commits rewrite + audit | Correct parent atomic batch; service expresses merge intent only; rebuild is enqueued after commit | Business rows roll back with the rewrite; prepare occurs before the writer as required by Watermelon | Keep `persistBatch`/future `AccountMergeTransactionCoordinator` as commit owner |

The scoped hard-delete behavior has repository coverage in `src/data/repositories/__tests__/BudgetRepository.test.ts`; add a two-workplace merge-preparer test and a batch-failure rollback test.

### 4. Planned-payment mutations

| Path                                   | Initiator                         | Tables                                                   | Current transaction owner                                                                                                                                           | Audit/rebuild behavior                                                                                | Rollback gap                                                                                    | Recommended owner                                                               |
| -------------------------------------- | --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Create/update                          | Planned-payment form              | `planned_payments`; create then may generate ledger rows | `PlannedPaymentRepository` at `src/data/repositories/PlannedPaymentRepository.ts:86-124`; command at `src/services/planned-payment/plannedPaymentCommands.ts:18-43` | No planned-payment audit; due processing follows create                                               | Payment can commit while due-journal generation fails                                           | `PlannedPaymentTransactionCoordinator.create/update`                            |
| Delete and dependent unposted journals | Planned-payment details           | `planned_payments`, `journals`, `transactions`           | `PlannedPaymentRepository.prepareDelete` + `JournalPlannedQueries.prepareSoftDeleteUpdates`; `persistBatch` owns the writer | One local batch; no audit/rebuild intent                                                              | Correct atomic rows                                                                             | Keep `persistBatch` as owner                                                    |
| Pause/resume                           | Planned-payment details           | `planned_payments`, `journals`                           | `PlannedPaymentRepository.prepareStatusUpdate` + `JournalPlannedQueries.prepareStatusUpdates`; `persistBatch` owns the writer | Status rows are batched; resume invokes due processing afterward                                      | Resume may commit ACTIVE state while generation fails                                           | Keep `persistBatch` as owner plus resumable occurrence processing               |
| Post/skip occurrence                   | Planned-payment scheduler/details | ledger tables, `planned_payments` | `LedgerWriteService.createJournal/postJournal` extra ops, or `persistBatch` for skip-of-existing, at `plannedPaymentOrchestration.ts` | Ledger audit and schedule advance are in the same batch; rebuild is enqueued after commit | Business rows roll back together; derived projection may remain stale until retriggered | Keep ledger/`persistBatch` as owner |
| Generate due horizon                   | Bootstrap/scheduler               | repeated ledger commits and planned-payment updates      | Loop at `plannedPaymentOrchestration.ts`; each generated journal batches its schedule advance                                                                       | Duplicate check is still read-before-write; already-existing days still get a trailing schedule write | Concurrent runs can both pass `countOnDay`; trailing update remains for already-journalled days | Keep per-occurrence extra ops; add durable idempotency by workplace/payment/day |

Existing evidence: `src/services/planned-payment/__tests__/plannedPaymentCommands.integration.test.ts:57-192` and `src/services/__tests__/PlannedPaymentService.test.ts:253-509`. Add concurrency and failure-between-ledger-and-schedule tests.

### 5. SMS mutations

| Path                                 | Initiator                                   | Tables                                                                                   | Current transaction owner                                                                                                   | Audit/rebuild/external effects                                                                  | Rollback gap                                                                                                                             | Recommended owner                                                                         |
| ------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Rule save/delete                     | Settings SMS rules                          | `transaction_auto_post_rules`                                                            | `TransactionAutoPostRuleRepository` at `src/data/repositories/TransactionAutoPostRuleRepository.ts:50-114`                  | No audit; repository-scoped CRUD                                                                | Legitimate single-aggregate seam                                                                                                         | Retain repository; decide audit policy                                                    |
| Dismiss/status/link existing journal | Settings inbox (duplicate accept / dismiss) | `transaction_inbox_records`                                                              | `TransactionInboxRepository.persistStatus/persistLink`                                                                      | Inbox row only; journal already exists                                                          | Legitimate single-row seam after the journal commit                                                                                      | Keep inbox repository                                                                     |
| Manual journal import                | Journal editor launched from inbox          | `journals`, `transactions`, optional metadata, `audit_logs`, `transaction_inbox_records` | `JournalService.saveJournalEntry` loads the inbox row and passes link ops into `LedgerWriteService.createJournal` extra ops | Journal audit and inbox IMPORTED link are one writer; rebuild is enqueued after commit; no independent processed-id ack is required | Business rows roll back together; retry is idempotent via linked journal / fingerprint; projection refresh can be retriggered | Keep `LedgerWriteService.createJournal` as owner |
| Scan/upsert                          | SMS foreground/background scan              | `transaction_inbox_records` | `TransactionInboxRepository.persistScanBatch` and `prepareUpsert`; pipeline supplies plain write data and final idempotency recheck | Rebuild is enqueued after the inbox write; analytics runs after the write resolves | Failed batch cannot create an orphaned trigger; a lost trigger leaves a disposable projection stale | Keep inbox repository persistScanBatch |
| Auto-post                            | Same scan                                   | inbox plus `journals`, `transactions`, optional metadata, `audit_logs` | Pipeline supplies journal ops and write data; `TransactionInboxRepository.persistScanBatch` owns model preparation and the writer | Audit is batched with inbox upsert; rebuild is enqueued after commit; analytics runs after commit | Concurrent scans are single-flight per workplace; final write rechecks journals/inbox/processed ids | Keep scan persist as owner |

The initial pipeline lookup at `SmsSyncPipeline.ts:143` and rebuild follow-up queries require explicit workplace predicates. Existing integration coverage verifies workplace-scoped queue requests and batch composition at `src/services/sms/__tests__/SmsSyncPipeline.integration.test.ts:506-552` and `src/services/__tests__/sms-service-batch.test.ts:94-210`; native device failure interleavings remain open.

### 6. Rebuild, integrity, and audit maintenance

| Path                    | Initiator                        | Tables                                                                     | Current transaction owner                                                                                                                                      | Audit/rebuild behavior                                                                               | Rollback gap                                                                                                                                                                    | Recommended owner                                                                                                            |
| ----------------------- | -------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Running-balance rebuild | Rebuild queue, integrity, import | `transactions.running_balance`, `balance_snapshots`, `accounts.updated_at` | `AccountingRebuildService` opens writer at `src/services/AccountingRebuildService.ts` and owns prepared ops in `rebuildAccountBalancesInternal` | Derived repair normally has no audit; integrity repair can pass audit `extraOps` into the same batch; MMKV dispatch state is disposable and outside the business transaction | Follow-up transaction/snapshot fetches include `workplace_id`. A lost queue item can leave derived data stale until startup/manual repair; native writer behavior remains unproven | Keep `AccountingRebuildService` as owner; keep scheduling in `RebuildQueueService` |
| Integrity force repair  | Settings/bootstrap/import        | same derived tables plus `audit_logs` | Per-account writer at `src/services/integrity/integrityRepair.ts` calls `AccountingRebuildService` with a prepared audit op; final account refresh uses `persistBatch` | Repair audit is in the same batch as the rebuild; follow-up rebuild requests are disposable MMKV triggers | Repair and audit roll back together; native writer behavior remains unproven | Keep integrity + rebuild extra ops; no named coordinator |

| Audit legacy cleanup | Bootstrap/maintenance | `audit_logs` | `AuditService` at `src/services/audit-service.ts:95-124` | No audit-of-audit expected | Legitimate maintenance operation, but physical mechanics belong in repository | `AuditMaintenanceRepository` |

Existing evidence: `src/data/repositories/__tests__/TransactionRepository.test.ts:120-268` and `src/services/__tests__/IntegrityService.test.ts:100-208`. Add two-workplace snapshot invalidation, interrupted rebuild retry, and repair-audit failure tests. UUIDv4 account IDs make same-ID cross-workplace collision implausible; workplace predicates still protect query scope.

### 7. Import, reset, and workplace lifecycle

| Path                     | Initiator                          | Tables                                                                                                                                                           | Current transaction owner                                                                                                                       | Side effects                                                                         | Rollback gap                                                                                                                                                                                                                        | Recommended owner                                                                                                    |
| ------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Stage full import        | Import feature/plugin              | 13 workplace-scoped tables: accounts, journals, transactions, audit logs, budgets/scopes, account/journal metadata, planned payments, SMS rules/inbox, snapshots | `ImportRepository.batchInsert` at `src/data/repositories/ImportRepository.ts:110-430` | Calculates imported balances, writes `_raw` IDs/status, chunks batches at `:408-425`; derived balances are regenerated by post-import rebuild | Later chunk failure leaves a partial staging workplace; target is protected only if best-effort discard succeeds at `src/services/import/ImportService.ts:127-131` | `ImportStagingRepository` |
| Commit staged import     | Import service                     | every workplace-scoped table                                                                                                                                     | `DatabaseRepository.swapStagedWorkplaceInto` at `src/data/repositories/DatabaseRepository.ts`; caller `src/services/import/importStaging.ts`    | Raw path manually repairs Watermelon cache                                           | Raw DELETE/UPDATE steps run inside a SQL `SAVEPOINT import_swap` (released on success, rolled back on failure) plus the Watermelon writer. ORM fallback remains one `batch`. Adapter-contract fault injection is covered; native device execution remains unproven | Keep `DatabaseRepository.swapStagedWorkplaceInto`; native device proof is deferred, not a new coordinator |
| Post-import finalization | Import service                     | workplace row, exchange-rate cache, derived balances/snapshots, preferences                                                                                      | `ImportService` sequence at `src/services/import/ImportService.ts:134-223`                                                                      | Rebuild failure is warning-only at `:202-205`; preferences update last               | Target ledger has committed; later failure leaves a partially finalized but potentially usable import with no durable resume marker                                                                                                 | `PostImportFinalizationCoordinator` with persisted phase/retry state                                                 |
| Incremental apply        | No production caller               | accounts, journals, transactions, audit logs                                                                                                                     | `ImportRepository.applyChanges` at `ImportRepository.ts:436-610`                                                                                | One batch                                                                            | Dead public mutation surface can drift from full import and bypass orchestration                                                                                                                                                    | Delete until needed, or expose only through import coordinator                                                       |
| Create/delete workplace  | Onboarding/settings/import staging | `workplaces`, system accounts, optional initial ledger; all workplace tables on delete                                                                           | `WorkplaceRepository`, `WorkplaceService`, and integrity maintenance split ownership at `src/services/WorkplaceService.ts:13-78` and `:156-173` | Analytics/preferences follow persistence                                             | Creation can leave an empty/partially bootstrapped workplace. Deletion purges data then destroys workplace in a second write                                                                                                        | `WorkplaceLifecycleCoordinator`                                                                                      |
| Purge/reset/cleanup      | Settings/dev maintenance           | all database/workplace tables                                                                                                                                    | `DatabaseRepository` at `DatabaseRepository.ts:70-166`; service wrapper at `src/services/integrity/integrityMaintenance.ts:15-64`               | Factory reset separately clears SMS MMKV and preferences                             | Irreversible DB reset may succeed, then cache/preferences cleanup fails and reports overall failure. Workplace purge and shell deletion are separate                                                                                | `DatabaseMaintenanceRepository` plus `FactoryResetCoordinator` with explicit irreversible completion semantics       |

The staging architecture is sound in intent: parse, backup, stage, verify, swap (`ImportService.ts:73-126`). The target ledger is protected from chunk failures because the swap operates on a staging workplace. The remaining target-integrity risk is native SQLite/JSI savepoint behavior and device cache coherence under a mid-swap failure, not chunking itself.

Existing evidence: `src/services/import/__tests__/ImportService.workflow.test.ts:127-326`, `src/services/import/__tests__/ImportService.workflow.integration.test.ts:27-70`, `src/data/repositories/__tests__/ImportRepository.test.ts:15-121`, `src/data/repositories/__tests__/DatabaseRepository.test.ts:31-158`, and `src/data/repositories/__tests__/DatabaseRepository.adapter-contract.test.ts:34-150`. The adapter-contract test injects faults after every DELETE/UPDATE boundary and asserts savepoint restoration/release and no cache notifications; native SQLite/JSI execution remains deferred.

## Approved persistence seams

Retain these database-facing modules, with narrower interfaces where noted:

- `AccountRepository`: account and account-metadata CRUD/preparers (`src/data/repositories/AccountRepository.ts:407-570`). Coordinators should consume prepared operations for auditable commands.
- `BudgetRepository`: budget/scope aggregate (`src/data/repositories/BudgetRepository.ts:84-190`).
- `JournalWriteRepository`: table-local journal/transaction/metadata preparation (`src/data/repositories/journal/journalWriteRepository.ts:64-124`). Make standalone mutation methods coordinator-private.
- `AuditRepository`: standalone log and prepared audit operation (`src/data/repositories/AuditRepository.ts:30-70`).
- `PlannedPaymentRepository`, `TransactionAutoPostRuleRepository`, `WorkplaceRepository`: single-aggregate CRUD. Cross-domain flows belong to coordinators.
- `BalanceSnapshotRepository`: snapshot CRUD and raw read optimization (`src/data/repositories/BalanceSnapshotRepository.ts:40-159`). Rebuild-wide persistence belongs in a dedicated repository.
- `CurrencyRepository` and `ExchangeRateRepository`: global reference/cache data; no workplace audit/rebuild obligations.
- `ImportRepository`: approved import-only materialization seam. Complete `src/data/repositories/importPersistenceAdapter.ts:1-31` so it is the sole `_raw` writer.
- `DatabaseRepository`: approved privileged lifecycle seam for purge/reset/swap. Rename around capabilities and remove generic table-name authority from normal callers.

## Privileged adapter and private-model inventory

`src/data/database/DatabaseUtils.ts:6-26` is the single raw bridge. It traverses `database.adapter.underlyingAdapter._dispatcher._db` and exposes native `unsafeQueryRaw` as an `any`-typed `queryRaw`. This concentration is good; the untyped arbitrary-SQL capability is not.

Consumers:

- Raw read paths: `src/data/repositories/BalanceSnapshotRepository.ts:66-121` and `src/data/repositories/raw/TransactionRawMetricsQueries.ts:45-62`. Retain behind typed query interfaces.
- Raw mutation paths: `DatabaseRepository.ts:117-247`. Isolate in `WorkplaceDataMutationGateway`; do not expose raw SQL to domain coordinators.
- Private cache repair: `DatabaseRepository.ts:32-67` accesses `_cache` and `_notify`. Separate as `WatermelonCacheSynchronizer` and test it against supported Watermelon versions.
- Import `_raw` ID/sync-state writes: `ImportRepository.ts:138-388`, plus adapter helper `importPersistenceAdapter.ts:1-31`. Legitimate import compatibility seam; centralize all such assignments.
- Forced workplace identity: `WorkplaceRepository.ts:26-35`. Restrict to import/staging APIs.
- Private journal timestamp mutation: `journalWriteRepository.ts:208-219` uses `_setRaw`; replace with the supported model field API during coordinator migration.
- Export ORM fallback `_raw` projection is isolated in `src/data/repositories/export/ExportOrmAdapter.ts`; the service consumes `ExportRepository.fetchOrmTable`.

Schema migration SQL in `src/data/database/migrations.ts:15-909` is legitimate infrastructure. The 71 `unsafeExecuteSql` calls are versioned schema/data migrations, including workplace backfill and triggers at `:518-597`. They should not be migrated into repositories. They do need fixture upgrades from representative historical versions; current `src/data/database/__tests__/migrations.test.ts:50-168` mostly validates current schema/reset behavior.

The Cashew plugin opens a copied external SQLite backup for read-only conversion (`src/services/import/plugins/cashew-plugin.ts:202-268`). It is not app-database persistence and remains outside these ownership rules.

## Bounded migration slices, risk ordered

### Slice 1 — P0 SMS commit and idempotency boundary

Landed without a new coordinator class: `TransactionInboxRepository` + `LedgerWriteService.createJournal` extra ops.

- [x] Move MMKV acknowledgement and analytics after successful database commit.
- [x] Recheck workplace/message idempotency at the write boundary (existing scan recheck, now inside `persistScanBatch`).
- [x] Commit inbox with auto-post journal/transactions/metadata/audit in one writer; rebuild enqueue after batch.
- [x] Make inbox mutation preparation repository-owned.
- Rebuild delivery is an after-commit MMKV trigger for disposable projections. SMS processed IDs are no longer an independent correctness source.
- [x] Real-writer cancellation coverage asserts no inbox row or after-commit callback when cancellation arrives before batching (`TransactionInboxRepository.integration.test.ts`).

### Slice 2 — P0 account merge

Landed without a new coordinator class: preload + `persistBatch` of rewrite ops and audit.

- [x] Preload all merge records before entering the writer.
- [x] Batch audit with the cross-domain rewrite.
- [x] Add workplace predicates to rebuild transaction/snapshot/account follow-up reads.
- Merge rebuild work is enqueued after the parent `persistBatch`; the queue owns later retry state.

### Slice 3 — P0 planned-payment occurrence

Landed without a new coordinator class: schedule advance is extra ops on the journal/post/skip writer.

- [x] Atomically create/post/skip the journal and advance the schedule.
- Concurrent due-horizon generate still has a read-before-write window (`countOnDay`); explicit occurrence identity is deferred until a real double-post shows up.
- Ledger rebuild work is enqueued after the journal/schedule batch; the queue owns later retry state.

### Slice 4 — P1 account command audit batching

Landed on `AccountRepository` extra ops / `persistBatch`.

- [x] Create-with-opening-balance, update/order/reconcile, delete/recover, archive, and bulk update batch their audit rows.
- Type-change rebuild work is enqueued after the account mutation; the queue owns later retry state.
- Run analytics/cache invalidation only after commit.

Tests: injected audit and ledger failures for every command; cache invalidation ordering; type-change rebuild delivery; recovery parity.

Follow-up integration coverage now exercises real integrity repair, planned-payment, SMS inbox, and import writers; native device behavior remains explicitly outside the test environment.

### Slice 5 — P1 canonical journal coordinator

Owner: `JournalTransactionCoordinator` plus a bulk variant if necessary.

- Move Watermelon mutation mechanics out of `LedgerWriteService`.
- Make `JournalWriteRepository` prepare-only/internal for application commands.
- Fold reversal into one transaction.
- Define audit policy for bulk rename/duplicate/merge/delete/reassign.
- Replace arbitrary `afterBatch` callbacks with a typed commit result and after-commit dispatcher.

Tests: batch failure for create/update/delete/post/revert/reversal; audit presence; rebuild delivery; no direct repository bypass; bulk audit policy.

### Slice 6 — P1 staged import commit

Owners: `DatabaseRepository.swapStagedWorkplaceInto` (no new coordinator).

- Type the raw adapter capability (`RawSqlAdapter`).
- [x] Wrap raw DELETE/UPDATE swap in a SQL `SAVEPOINT` with rollback on failure; ORM fallback remains one batch.
- Import phase/finalization resume across process death is deferred; discard stays the recovery path.
- Keep chunked inserts isolated to staging; make discard reliable and observable.

Tests: mocked savepoint rollback is covered in `DatabaseRepository.test.ts`; adapter-contract fault injection is covered in `DatabaseRepository.adapter-contract.test.ts`; real import staging failure and target preservation are covered in `ImportService.workflow.integration.test.ts`. Native device fault injection remains deferred.

### Slice 7 — P2 projections, repair, and maintenance

Owners: `AccountingRebuildService` extra ops, `IntegrityService`, `DatabaseRepository` (no new coordinator classes).

- Move model collection queries and prepared projection writes out of services.
- [x] Batch integrity repair audit with the rebuild write; account refresh via `persistBatch`.
- [x] Workplace predicates on rebuild transaction/snapshot follow-up reads.
- Rebuild queue dispatches disposable MMKV work with coalescing, bounded in-process retries, and processing-marker recovery. Process death may lose pending projection work; startup integrity and manual force-rebuild are the recovery paths.
- Give reset/purge irreversible completion semantics.
- Isolate Watermelon cache internals behind one tested adapter.

Tests: interrupted repair/retry; audit failure; reset post-cleanup failure; raw adapter unavailable; missing migration table; cache coherence.

### Slice 8 — P3 seam cleanup

- [x] Move budget and planned-payment account-merge preparers into repositories.
- [x] Move transaction merge and account archive preparation into repositories.
- [x] Move rebuild, integrity, journal lifecycle, and export ORM preparation behind repository seams.
- Delete unused journal and import mutation APIs.
- Replace `_setRaw` and consolidate `_raw` writes in the import adapter.
- [x] Update the direct-write and service-model ratchets after each migration; never raise either baseline.

## Definition of done for WP-4 implementation

- Every application mutation has exactly one named repository or transaction coordinator owner.
- No service or command module calls `database.write`, `database.batch`, model `update`, or model `prepare*`.
- Audit rows that define the business mutation are in the same durable batch.
- Rebuild/repair recovery uses startup integrity, manual force-rebuild, and the disposable MMKV queue. A durable outbox is intentionally not part of the financial correctness contract.
- Raw SQL mutation is available only through a typed infrastructure capability (`RawSqlAdapter`).
- Import swap rollback is covered by a SQL `SAVEPOINT`, a real adapter-contract fault-injection suite, and a real workflow preservation test; native SQLite/JSI device execution remains deferred.
- Architecture ratchets decrease from the current baseline and reject new bypasses.
