# Persistence Ownership Inventory

Status: WP-4 design inventory complete
Snapshot: `6d282b63`
Scope: production persistence primitives, privileged adapter access, cross-domain mutation workflows, and the tests that define their contracts

## Audit coverage

- Repository source files mechanically scanned: 1,052.
- Production files containing candidate persistence primitives: 50; analyzed: 50; blocked: 0.
- Production files containing privileged/raw access candidates: 11; analyzed: 11; blocked: 0.
- Direct service-owned `database.write`/`database.batch` violations already ratcheted: 38 across 15 service/testing files.
- Relevant persistence-contract test files inspected: 30.
- Schema migrations inspected: versions 2 through 31, including 71 `unsafeExecuteSql` calls.
- Search families: `database.(write|batch|action)`, model `create`/`update`/`prepare*`/delete calls, `getRawAdapter`, `queryRaw`, `unsafeQueryRaw`, `_raw`, `_setRaw`, `_cache`, `_notify`, and all production callers of the resulting mutation APIs.

False positives were classified and excluded: React state setters, chart/animation `.update` calls, and the non-Watermelon preferences store. Tests, fixtures, and `src/testing` helpers are evidence or approved test infrastructure, not application transaction owners.

Inventory status: **COMPLETE**. No mutation path found by the scoped primitive and caller sweeps remains unclassified. One implementation gate remains: the repository does not prove that sequential private-adapter `queryRaw` calls inside a Watermelon writer share a SQL rollback boundary. The migration plan treats that guarantee as absent until a native-adapter integration test proves otherwise.

## Verdict

**Fixable.** The codebase has real repositories and several good atomic batches. The failure is competing ownership: services, repositories, and command modules can each open transactions, while audit, rebuild, cache, preferences, and external SMS acknowledgement are inconsistently inside or outside the durable commit.

The highest-risk concrete failures are:

1. SMS marks an external message processed before its database batch commits.
2. Account merge commits cross-domain rewrites before audit and rebuild obligations complete.
3. Planned-payment occurrence posting and schedule advancement are separate commits.
4. The staged-import raw swap is called atomic, but executes sequential private-adapter deletes and updates without a proved rollback contract.
5. Rebuild follow-up model queries omit workplace predicates even though the raw source query is scoped.

## Target ownership model

Services should validate and express domain intent. Repositories should load records and prepare table-local operations. A named transaction coordinator should own each cross-table business commit. External or derived effects should run through an explicit after-commit contract; effects that must survive process death need a durable outbox/repair marker.

```text
feature / background trigger
  -> domain command service (validate and build intent)
  -> named transaction coordinator (one durable commit owner)
       -> repositories (scoped reads + prepared table-local operations)
       -> audit operation in the same batch when audit is part of the contract
       -> durable rebuild/repair intent when eventual work is mandatory
  -> after-commit effects (analytics, MMKV cache, notifications)
```

No feature or presentation file directly opens a Watermelon write. The leakage begins in service and command modules.

## Mutation-path inventory

### 1. Journal and ledger mutations

| Path | Initiator | Tables | Current transaction owner | Audit/rebuild behavior | Rollback gap | Recommended owner |
| --- | --- | --- | --- | --- | --- | --- |
| Create one/many | Journal feature, account opening/adjustment, planned payments, SMS | `journals`, `transactions`, optional `journal_metadata`, `audit_logs` | `LedgerWriteService` at `src/services/ledger/ledgerWriteService.ts:86-136` using preparers at `src/data/repositories/journal/journalWriteRepository.ts:64-124` | Audit is batched; rebuild is enqueued at `ledgerWriteService.ts:92-95` and `133-135` | Queue mutation is not durable and occurs inside the writer callback; alternate repository APIs can bypass both policies | `JournalTransactionCoordinator.create/createMany` |
| Update journal and legs | Journal edit | same four tables | Split: `LedgerWriteService` builds audit/rebuild intent at `ledgerWriteService.ts:141-202`; `JournalWriteRepository` owns the writer at `journalWriteRepository.ts:154-267` | Audit op is batched; rebuild is injected as `afterBatch` at `journalWriteRepository.ts:253-256` | A repository method accepts an arbitrary callback and mixes commit mechanics with post-commit policy; queue failure semantics are undefined | `JournalTransactionCoordinator.update` |
| Delete/recover | Journal actions | `journals`, `transactions`, `audit_logs` | `LedgerWriteService` at `ledgerWriteService.ts:205-288` | Audit is batched; rebuild enqueued after batch | Durable rows roll back together, but mandatory rebuild intent is not durable | `JournalTransactionCoordinator.delete/recover` |
| Post/revert planned status | Journal/planned-payment actions | `journal_metadata`, `journals`, `transactions`, `audit_logs` | `LedgerWriteService` at `ledgerWriteService.ts:291-425` | Audit is batched; rebuild enqueued after batch | Same non-durable rebuild gap; service owns ORM mutation mechanics | `JournalTransactionCoordinator.post/revert` |
| Reversal | Journal action | new reversal `journals`/`transactions`/`audit_logs`, original `journal` | `LedgerWriteService.createReversalJournal` at `ledgerWriteService.ts` using `JournalWriteRepository.persistReversal` in one writer | Audit is batched with the reversal create; original is marked `REVERSED` in the same batch; rebuild enqueued after batch | Durable rows roll back together; rebuild intent is still not durable | Keep `LedgerWriteService.createReversalJournal` as owner until a named coordinator exists; next gap is durable rebuild/outbox |
| Bulk rename | Journal list | `journals` | `JournalWriteRepository.bulkUpdateDescriptions` at `journalWriteRepository.ts:458-484`; caller `src/services/journal/journalBulkCommands.ts:59-88` | No audit; no rebuild needed | Atomic rows, but no audit contract | `JournalTransactionCoordinator.bulkRename` if renames are auditable; otherwise retain repository ownership explicitly |
| Bulk duplicate/merge/delete/reassign | Journal list | `journals`, `transactions`, optional `journal_metadata` | Repository methods at `journalWriteRepository.ts:489-710`; callers at `journalBulkCommands.ts:98-136`, `291-321`, `448-508`, `555-566` | Rebuild enqueued by caller after repository commit; no audit rows | A committed bulk mutation can lose rebuild scheduling; merge/delete/reassign bypass canonical audit policy | `JournalBulkTransactionCoordinator` |

`JournalWriteRepository` also exposes unused production mutation APIs: `createJournalWithTransactions` (`:127`), `updateJournalStatus` (`:270`), `softDeleteJournal` (`:288`), and `replaceJournalWithReversal` (`:347`). No production caller exists. Delete or make them coordinator-private before adding another write path.

Existing evidence: `src/services/ledger/__tests__/ledgerWriteService.write.test.ts:61-160`, `src/services/ledger/__tests__/ledgerWriteService.lifecycle.test.ts:74-289`, and `src/services/journal/__tests__/journalBulkCommands.test.ts:63-291`. These prove happy-path batching and lifecycle behavior, not failure rollback or durable rebuild delivery.

### 2. Account mutations

| Path | Initiator | Tables | Current transaction owner | Audit/rebuild behavior | Rollback gap | Recommended owner |
| --- | --- | --- | --- | --- | --- | --- |
| Create, optional opening balance | Account form, onboarding, system-account lookup | `accounts`, optional `account_metadata`, `audit_logs`; optionally opening-balances equity plus `journals`/`transactions`/ledger audit | `AccountRepository.persistCreatedAccount` at `src/data/repositories/AccountRepository.ts`; command intent at `src/services/accounts/accountCommands.ts` | Account CREATE audit is batched with the account; opening journal is a follow-up batch in the same writer; rebuild enqueued after batch | Durable rows roll back together; rebuild intent is still not durable. `getOpeningBalancesAccountId` / balance-correction lookup can still create equity in a separate write when used outside `createAccount` | Keep `AccountRepository.persistCreatedAccount` as owner until a named coordinator exists; next gap is durable rebuild/outbox and remaining system-account creates |
| Update/order/reconcile | Account forms, list reorder, reconciliation | `accounts`, optional `account_metadata`, then `audit_logs` | Repository write at `AccountRepository.ts:534-552`; commands at `accountHierarchyCommands.ts:222-246`, `314-334`, and `accountReconcileCommands.ts:7-32` | Audit follows in a separate write; account-type rebuild follows commit | Mutation survives audit failure; rebuild intent can be lost | `AccountTransactionCoordinator.update/reorder/reconcile` |
| Bulk update | Account list/hierarchy | `accounts`, `account_metadata`, `audit_logs` | Command layer opens writer at `accountHierarchyCommands.ts:259-308` and uses repository preparers | Audit is correctly in the batch; rebuild occurs after commit | Correct atomic shape in the wrong layer; rebuild remains non-durable | `AccountTransactionCoordinator.bulkUpdate` |
| Archive/unarchive | Account list/archive modal | `accounts`, `audit_logs` | Command layer at `src/services/accounts/accountArchiveCommands.ts:81-99` | Audit is correctly batched; cache invalidation follows commit | Cache invalidation failure leaves stale presentation state; persistence mechanics live in service | `AccountTransactionCoordinator.archive` with after-commit cache invalidation |
| Delete/recover | Account actions/audit revert | `accounts`, then `audit_logs` | Delete uses `AccountRepository.delete`; recover directly opens a writer at `src/services/accounts/accountDeleteCommands.ts:26-96` | Audit is always a later independent write | Deleted/recovered account may have no audit record; recovery bypasses repository mutation API | `AccountTransactionCoordinator.delete/recover` |
| Merge accounts | Account merge action | `transactions`, `planned_payments`, `transaction_auto_post_rules`, `budget_scopes`, `budgets`, `accounts`, `account_metadata`, `balance_snapshots` | `src/services/accounts/accountMergeCommands.ts:88-212` opens the cross-domain writer; preparers come from repositories and services | Rebuild at `:189`; audit at `:191-202`; analytics afterward | Cross-domain rewrite commits before audit/rebuild. Async reads occur inside the writer at `:120-185`, widening lock time. A failure leaves stale balances or missing audit | `AccountMergeTransactionCoordinator` |
| Balance adjustment | Account details/form | ledger tables | Delegates correctly to ledger at `src/services/accounts/accountAdjustCommands.ts:21-90` | Ledger audit/rebuild policy applies | No separate account mutation; retain as domain command | `JournalTransactionCoordinator` remains owner |

Merge preparers are distributed across `src/data/repositories/account/AccountMergeOperations.ts:17-100`, `src/services/planned-payment/plannedPaymentMergeOperations.ts:8-47`, `src/data/repositories/TransactionAutoPostRuleRepository.ts:142-162`, `src/services/budget/budgetWriteService.ts:73-112`, and `src/data/repositories/BalanceSnapshotRepository.ts:151-159`. The service-owned budget/planned-payment preparers are persistence mechanics and should move to their repositories.

Existing evidence: `src/services/accounts/__tests__/accountCommands.integration.test.ts:37-213` and `src/services/accounts/__tests__/accountArchiveCommands.integration.test.ts:15-204`. They prove aggregate outcomes but do not inject audit, rebuild, or mid-merge failure.

### 3. Budget mutations

| Path | Initiator | Tables | Current transaction owner | Side effects/gap | Recommended owner |
| --- | --- | --- | --- | --- | --- |
| Create/update/delete | Budget forms/details | `budgets`, `budget_scopes` | `BudgetRepository` at `src/data/repositories/BudgetRepository.ts:84-190` | Budget and scopes are correctly batched; analytics is post-commit. No audit contract exists | Retain `BudgetRepository`; decide explicitly whether budgets require audit |
| Account-merge rewrite | Account merge | same tables | `BudgetWriteService.prepareMergeOperations` at `src/services/budget/budgetWriteService.ts:73-112`; parent account-merge command commits | Correct parent atomic batch, but service exposes Watermelon models/preparers | Move preparer to `BudgetRepository`; transaction remains owned by `AccountMergeTransactionCoordinator` |

The scoped hard-delete behavior has repository coverage in `src/data/repositories/__tests__/BudgetRepository.test.ts`; add a two-workplace merge-preparer test and a batch-failure rollback test.

### 4. Planned-payment mutations

| Path | Initiator | Tables | Current transaction owner | Audit/rebuild behavior | Rollback gap | Recommended owner |
| --- | --- | --- | --- | --- | --- | --- |
| Create/update | Planned-payment form | `planned_payments`; create then may generate ledger rows | `PlannedPaymentRepository` at `src/data/repositories/PlannedPaymentRepository.ts:86-124`; command at `src/services/planned-payment/plannedPaymentCommands.ts:18-43` | No planned-payment audit; due processing follows create | Payment can commit while due-journal generation fails | `PlannedPaymentTransactionCoordinator.create/update` |
| Delete and dependent unposted journals | Planned-payment details | `planned_payments`, `journals`, `transactions` | Service command at `plannedPaymentCommands.ts:45-94` | One local batch; no audit/rebuild intent | Correct atomic rows, wrong layer; lifecycle obligation is implicit | `PlannedPaymentTransactionCoordinator.delete` |
| Pause/resume | Planned-payment details | `planned_payments`, `journals` | Service at `src/services/planned-payment/plannedPaymentLifecycle.ts:16-73` | Status rows are batched; resume invokes due processing afterward | Resume may commit ACTIVE state while generation fails | `PlannedPaymentTransactionCoordinator.setStatus` plus resumable occurrence processing |
| Post/skip occurrence | Planned-payment scheduler/details | ledger tables, then `planned_payments` | Sequence at `src/services/planned-payment/plannedPaymentOrchestration.ts:72-168` | Ledger path audits/rebuilds; schedule advance is separate at `:106` or `:158` | Crash after journal creation/posting but before schedule advance enables replay/duplicate occurrence | `PlannedPaymentOccurrenceCoordinator` |
| Generate due horizon | Bootstrap/scheduler | repeated ledger commits and planned-payment updates | Loop at `plannedPaymentOrchestration.ts:173-245` | Duplicate check is read-before-write; schedule advances separately | Concurrent runs can both pass `countOnDay` and generate the same occurrence; partial progress is not recorded as a workflow | `PlannedPaymentOccurrenceCoordinator`, idempotent by workplace/payment/day |

Existing evidence: `src/services/planned-payment/__tests__/plannedPaymentCommands.integration.test.ts:57-192` and `src/services/__tests__/PlannedPaymentService.test.ts:253-509`. Add concurrency and failure-between-ledger-and-schedule tests.

### 5. SMS mutations

| Path | Initiator | Tables | Current transaction owner | Audit/rebuild/external effects | Rollback gap | Recommended owner |
| --- | --- | --- | --- | --- | --- | --- |
| Rule save/delete | Settings SMS rules | `transaction_auto_post_rules` | `TransactionAutoPostRuleRepository` at `src/data/repositories/TransactionAutoPostRuleRepository.ts:50-114` | No audit; repository-scoped CRUD | Legitimate single-aggregate seam | Retain repository; decide audit policy |
| Dismiss/status/link manual import | Settings inbox and journal editor | `transaction_inbox_records`; manual journal is an earlier ledger commit | `SmsService` directly opens writers at `src/services/sms-service.ts:144-183`; UI continuation at `src/features/journal/entry/journalEntryPresentation.ts:168-179` | Manual journal audits/rebuilds, then inbox link is separate | Journal can commit while SMS remains pending; retry may create another journal. Persistence mechanics live in service | `SmsIngestionTransactionCoordinator.linkManualImport`; repository owns inbox prepare ops |
| Scan/upsert | SMS foreground/background scan | `transaction_inbox_records` | `SmsSyncPipeline` at `src/services/sms/SmsSyncPipeline.ts:250-297` | External processed cache and analytics may run before DB commit | Failed batch can leave MMKV saying processed with no inbox row | `SmsIngestionTransactionCoordinator.scan` |
| Auto-post | Same scan | inbox plus `journals`, `transactions`, optional metadata, `audit_logs` | Pipeline composes ledger preparers at `SmsSyncPipeline.ts:259-286`, then batches at `:289-291` | Audit is batched; rebuild at `:293-296`; MMKV marker at `:272-274` | Concurrent scans can both analyze then prepare a journal. Final write boundary does not recheck idempotency. External marker precedes commit | `SmsIngestionTransactionCoordinator.autoPost`, per-workplace single-flight and durable idempotency |

The initial pipeline lookup at `SmsSyncPipeline.ts:143` and rebuild follow-up queries require explicit workplace predicates. Add concurrent same-message, batch-failure-before-ack, retry-after-crash, and same-device-ID-across-two-workplaces tests. Existing tests at `src/services/sms/__tests__/SmsSyncPipeline.integration.test.ts:88-516`, `src/services/sms/__tests__/SmsSyncPipeline.test.ts:33-303`, and `src/services/__tests__/sms-service-batch.test.ts:94-210` cover duplicate classification and batch composition, not the failure interleavings.

### 6. Rebuild, integrity, and audit maintenance

| Path | Initiator | Tables | Current transaction owner | Audit/rebuild behavior | Rollback gap | Recommended owner |
| --- | --- | --- | --- | --- | --- | --- |
| Running-balance rebuild | Rebuild queue, integrity, import | `transactions.running_balance`, `balance_snapshots`, `accounts.updated_at` | `AccountingRebuildService` opens writer at `src/services/AccountingRebuildService.ts:27-51` and owns prepared ops at `:143-209` | Derived repair normally has no audit; integrity path audits later | Model fetches at `:151-162` omit workplace predicates, so scoped raw input can be followed by cross-workplace model mutation/invalidation | `BalanceRebuildPersistenceRepository` inside `BalanceRebuildCoordinator` |
| Integrity force repair | Settings/bootstrap/import | same derived tables, then `audit_logs` | Per-account service writer at `src/services/integrity-service.ts:381-439` | Repair audit follows commit at `:415-418`; account refresh is another write | Repair can succeed unaudited; multiple writes define one repair intent | `IntegrityRepairCoordinator` |
| Audit legacy cleanup | Bootstrap/maintenance | `audit_logs` | `AuditService` at `src/services/audit-service.ts:95-124` | No audit-of-audit expected | Legitimate maintenance operation, but physical mechanics belong in repository | `AuditMaintenanceRepository` |

Existing evidence: `src/data/repositories/__tests__/TransactionRepository.test.ts:120-268` and `src/services/__tests__/IntegrityService.test.ts:100-208`. Add two-workplace same-ID/snapshot invalidation, interrupted rebuild retry, and repair-audit failure tests.

### 7. Import, reset, and workplace lifecycle

| Path | Initiator | Tables | Current transaction owner | Side effects | Rollback gap | Recommended owner |
| --- | --- | --- | --- | --- | --- | --- |
| Stage full import | Import feature/plugin | 12 workplace-scoped tables: accounts, journals, transactions, audit logs, budgets/scopes, account/journal metadata, planned payments, SMS rules/inbox, snapshots | `ImportRepository.batchInsert` at `src/data/repositories/ImportRepository.ts:110-430` | Calculates imported balances, writes `_raw` IDs/status, chunks batches at `:408-425` | Later chunk failure leaves a partial staging workplace; target is protected only if best-effort discard succeeds at `src/services/import/ImportService.ts:127-131` | `ImportStagingRepository` |
| Commit staged import | Import service | every workplace-scoped table | `DatabaseRepository.swapStagedWorkplaceInto` at `src/data/repositories/DatabaseRepository.ts:172-247`; caller `src/services/import/importStaging.ts:49-58` | Raw path manually repairs Watermelon cache | Sequential raw DELETEs at `:180-192` then UPDATEs at `:193-209` have no repository-proved shared SQL rollback. Failure may purge/partially reassign target | `StagedImportCommitCoordinator` backed by `WorkplaceDataMutationGateway` |
| Post-import finalization | Import service | workplace row, exchange-rate cache, derived balances/snapshots, preferences | `ImportService` sequence at `src/services/import/ImportService.ts:134-223` | Rebuild failure is warning-only at `:202-205`; preferences update last | Target ledger has committed; later failure leaves a partially finalized but potentially usable import with no durable resume marker | `PostImportFinalizationCoordinator` with persisted phase/retry state |
| Incremental apply | No production caller | accounts, journals, transactions, audit logs | `ImportRepository.applyChanges` at `ImportRepository.ts:436-610` | One batch | Dead public mutation surface can drift from full import and bypass orchestration | Delete until needed, or expose only through import coordinator |
| Create/delete workplace | Onboarding/settings/import staging | `workplaces`, system accounts, optional initial ledger; all workplace tables on delete | `WorkplaceRepository`, `WorkplaceService`, and integrity maintenance split ownership at `src/services/WorkplaceService.ts:13-78` and `:156-173` | Analytics/preferences follow persistence | Creation can leave an empty/partially bootstrapped workplace. Deletion purges data then destroys workplace in a second write | `WorkplaceLifecycleCoordinator` |
| Purge/reset/cleanup | Settings/dev maintenance | all database/workplace tables | `DatabaseRepository` at `DatabaseRepository.ts:70-166`; service wrapper at `src/services/integrity/integrityMaintenance.ts:15-64` | Factory reset separately clears SMS MMKV and preferences | Irreversible DB reset may succeed, then cache/preferences cleanup fails and reports overall failure. Workplace purge and shell deletion are separate | `DatabaseMaintenanceRepository` plus `FactoryResetCoordinator` with explicit irreversible completion semantics |

The staging architecture is sound in intent: parse, backup, stage, verify, swap (`ImportService.ts:73-126`). The target ledger is not exposed to chunk failures. The unproved raw swap—not chunking itself—is the target-integrity risk.

Existing evidence: `src/services/import/__tests__/ImportService.workflow.test.ts:127-326`, `src/data/repositories/__tests__/ImportRepository.test.ts:15-121`, and `src/data/repositories/__tests__/DatabaseRepository.test.ts:31-158`. Current tests mock orchestration or cover happy-path fallback/cache behavior; none fault-inject every raw swap step on the native adapter.

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
- Export reads `_raw` at `src/services/export-service.ts:162`; read-only serialization concern, not transaction ownership.

Schema migration SQL in `src/data/database/migrations.ts:15-909` is legitimate infrastructure. The 71 `unsafeExecuteSql` calls are versioned schema/data migrations, including workplace backfill and triggers at `:518-597`. They should not be migrated into repositories. They do need fixture upgrades from representative historical versions; current `src/data/database/__tests__/migrations.test.ts:50-168` mostly validates current schema/reset behavior.

The Cashew plugin opens a copied external SQLite backup for read-only conversion (`src/services/import/plugins/cashew-plugin.ts:202-268`). It is not app-database persistence and remains outside these ownership rules.

## Bounded migration slices, risk ordered

### Slice 1 — P0 SMS commit and idempotency boundary

Owner: `SmsIngestionTransactionCoordinator`.

- Move MMKV acknowledgement and analytics after successful database commit.
- Add a final workplace/message idempotency check at the write boundary.
- Commit inbox, auto-post journal/transactions/metadata, audit, and durable rebuild intent together.
- Make inbox mutation preparation repository-owned.

Tests: concurrent same-message scans; same device ID in two workplaces; batch failure before acknowledgement; retry after crash; manual-import journal/link rollback; final duplicate check race.

### Slice 2 — P0 account merge and rebuild scope

Owners: `AccountMergeTransactionCoordinator`, `BalanceRebuildPersistenceRepository`.

- Preload all merge records before entering the writer.
- Batch audit with the cross-domain rewrite.
- Persist or otherwise make rebuild delivery recoverable.
- Add workplace predicates to rebuild transaction/snapshot/account follow-up reads.

Tests: fault after each preparer; no surviving source references; audit atomicity; rebuild delivery retry; two workplaces with colliding IDs/references; snapshot invalidation isolation.

### Slice 3 — P0 planned-payment occurrence coordinator

Owner: `PlannedPaymentOccurrenceCoordinator`.

- Make occurrence identity explicit: workplace + payment + normalized day.
- Atomically create/post/skip the journal and advance the schedule.
- Serialize or make concurrent due-processing idempotent.
- Include audit and durable rebuild obligations.

Tests: crash between journal and schedule; concurrent generators; retry after partial failure; pause/resume during generation; no duplicate day.

### Slice 4 — P1 account command coordinator

Owner: `AccountTransactionCoordinator`.

- Migrate create-with-opening-balance, update/order/reconcile, delete/recover, archive, and bulk update.
- Batch account audit with mutations.
- Define opening-balance behavior as all-or-nothing or persist an explicit recoverable initialization state.
- Run analytics/cache invalidation only after commit.

Tests: injected audit and ledger failures for every command; cache invalidation ordering; type-change rebuild delivery; recovery parity.

### Slice 5 — P1 canonical journal coordinator

Owner: `JournalTransactionCoordinator` plus a bulk variant if necessary.

- Move Watermelon mutation mechanics out of `LedgerWriteService`.
- Make `JournalWriteRepository` prepare-only/internal for application commands.
- Fold reversal into one transaction.
- Define audit policy for bulk rename/duplicate/merge/delete/reassign.
- Replace arbitrary `afterBatch` callbacks with a typed commit result and after-commit dispatcher.

Tests: batch failure for create/update/delete/post/revert/reversal; audit presence; rebuild delivery; no direct repository bypass; bulk audit policy.

### Slice 6 — P1 staged import commit

Owners: `ImportStagingRepository`, `StagedImportCommitCoordinator`, `PostImportFinalizationCoordinator`.

- Type the raw adapter capability.
- Prove one SQL rollback boundary for all target deletes and staging reassignments, or implement one explicit native transaction.
- Persist import phase/finalization state so restart can resume.
- Keep chunked inserts isolated to staging; make discard reliable and observable.

Tests: fault every raw DELETE/UPDATE step; raw/fallback parity across all workplace tables; cache coherence on failure; second-chunk failure; discard failure; restart after swap before metadata/preferences/rebuild.

### Slice 7 — P2 projections, repair, and maintenance

Owners: `BalanceRebuildPersistenceRepository`, `IntegrityRepairCoordinator`, `DatabaseMaintenanceRepository`, `AuditMaintenanceRepository`.

- Move model collection queries and prepared projection writes out of services.
- Batch repair audit or persist a recoverable repair record.
- Give reset/purge irreversible completion semantics.
- Isolate Watermelon cache internals behind one tested adapter.

Tests: interrupted repair/retry; audit failure; reset post-cleanup failure; raw adapter unavailable; missing migration table; cache coherence.

### Slice 8 — P3 seam cleanup

- Move budget and planned-payment account-merge preparers into repositories.
- Delete unused journal and import mutation APIs.
- Replace `_setRaw` and consolidate `_raw` writes in the import adapter.
- Update the direct-write ratchet after each migration; never raise the baseline.

## Definition of done for WP-4 implementation

- Every application mutation has exactly one named repository or transaction coordinator owner.
- No service or command module calls `database.write`, `database.batch`, model `update`, or model `prepare*`.
- Audit rows that define the business mutation are in the same durable batch.
- Mandatory rebuild/repair work is recoverable after process death; callbacks and in-memory queue calls are not treated as durable delivery.
- Raw SQL mutation is available only through a typed infrastructure capability.
- Import and reset semantics are verified against the native adapter, including failure injection.
- Architecture ratchets decrease from the current baseline and reject new bypasses.
