# WP-1 Workplace Isolation Audit

Audit target: `b37695c0abaa1fa00156fa9f1b25b60fbcc09c8a`
Scope: repository and service reads/mutations over workplace-owned tables, including raw SQL and WatermelonDB paths
Status: complete for the scoped persistence boundary

## Verdict

**Fixable, but not isolated today.** Three paths can cross workplace boundaries without first requiring corrupt data:

1. JSON export's ORM fallback exports every workplace.
2. SMS scanning can update/reassign another workplace's inbox row when device message IDs collide.
3. Transaction reporting silently drops its workplace predicate when more than 100 account IDs are queried.

Several additional raw joins and mutation helpers trust caller provenance instead of enforcing the workplace invariant locally. Those are not all directly exploitable through current UI call chains, but they make imported/corrupt links contagious and leave unsafe repository contracts available for future callers.

## Required invariant

Every public or internal persistence operation over a workplace-owned table must do both:

- accept a non-optional `workplaceId`, or operate on a model whose workplace is explicitly validated; and
- enforce `workplace_id = workplaceId` on every workplace-owned table read or mutated, including each raw SQL join and every ORM fallback.

IDs and caller provenance are not tenant boundaries. Globally unique IDs reduce collision probability; they do not make an unscoped API safe.

## Inventory and exclusions

`src/services/workplace/workplaceDataTables.ts:8-21` defines the audited workplace-owned tables:

| Table                         | Audit result                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `accounts`                    | Scoped primary repository reads; unsafe raw ID helpers, merge mutation, and partial raw joins remain |
| `journals`                    | Scoped primary query repository; unscoped enrichment API and partial joins remain                    |
| `transactions`                | Scoped primary CRUD except the >100 branch; partial raw joins and generic escape hatches remain      |
| `audit_logs`                  | Enforced by `workplaceId` on reads and writes                                                        |
| `budgets`                     | Enforced; write service validates referenced accounts                                                |
| `budget_scopes`               | Enforced on repository reads/mutations                                                               |
| `account_metadata`            | Enforced in account repository paths                                                                 |
| `planned_payments`            | Scoped repository reads; model-instance lifecycle helpers trust provenance                           |
| `journal_metadata`            | Enforced in metadata repository and journal write paths                                              |
| `transaction_auto_post_rules` | Enforced on reads/writes/merge operations                                                            |
| `transaction_inbox_records`   | Critical unscoped SMS scan lookup remains                                                            |
| `balance_snapshots`           | Primary repository is scoped; rebuild deletion query is only account/date scoped                     |

Genuinely global tables are `currencies`, `exchange_rates`, and the `workplaces` registry. They are intentionally excluded from workplace predicates.

The following are deliberate administrative/staging operations, not isolation defects:

- `ImportRepository.batchInsert` assigns the supplied staging/target workplace to imported rows.
- `ImportRepository.applyChanges` scopes ID queries to the supplied workplace.
- `DatabaseRepository.swapStagedWorkplaceInto` explicitly scopes both target and staging workplaces.
- workplace purge/reset paths intentionally operate across the complete declared workplace table set.
- full-database reset and deleted-record cleanup are explicitly global maintenance operations.
- `integrityService.scanForNullAccountTransactions(workplaceId?)` supports a global diagnostic mode, but production startup/manual call sites pass a workplace.

## P0 — direct cross-workplace paths

### P0.1 — Export fallback ignores the workplace

**Evidence**

- `src/services/export-service.ts:97-101` passes `workplaceId` into `fetchAndTransformTable`.
- `src/services/export-service.ts:126-147` scopes the raw SQL path when the table has `workplace_id`.
- `src/services/export-service.ts:154-169` falls back to `collection.query().fetch()` with no workplace predicate.
- `src/services/export-service.ts:217-259` invokes that path for every workplace-owned export table.

**Call sites**

- `src/features/settings/hooks/useSettingsActions.ts:14`
- `src/services/import/preImportBackupService.ts:61`

**Cross-workplace path**

When raw SQL is unavailable or rejected, exporting workplace B fetches all records from all 12 workplace tables. The archive is labelled as B's backup, leaking A's data and allowing restore/import contamination.

**Bounded slice WP-1A**

Add `Q.where('workplace_id', workplaceId)` to the fallback for workplace-owned tables and add a two-workplace test that forces raw-query failure. One application file plus a focused export test.

### P0.2 — SMS scan can mutate another workplace's inbox row

**Evidence**

- `src/services/sms/SmsSyncPipeline.ts:131` receives the scanning workplace.
- `src/services/sms/SmsSyncPipeline.ts:143-149` loads existing inbox rows by channel and `device_source_id`, without `workplace_id`.
- `src/services/sms/SmsSyncPipeline.ts:193-211` carries the foreign model into the upsert decision.
- `src/services/sms/SmsSyncPipeline.ts:460-520` prepares an update of that existing model; its payload contains the requested workplace at line 479 and the update branch is lines 505-511.

**Call sites**

- `src/services/sms-service.ts:48-75`
- `src/testing/smsTestHarness.ts:158`

**Cross-workplace path**

If A and B expose the same device message ID, scanning B selects A's existing inbox model. The update path can mutate/reassign A's row using B's payload rather than creating or updating B's row.

**Bounded slice WP-1B**

Scope the existing-record lookup by `workplace_id` and add a fake-SMS two-workplace collision test. One application file plus its pipeline test.

### P0.3 — The >100-account query drops workplace scope

**Evidence**

- `src/data/repositories/TransactionRepository.ts:535-598` implements `findByAccountsAndDateRange`.
- `src/data/repositories/TransactionRepository.ts:542-547` includes `workplace_id` in the normal path.
- `src/data/repositories/TransactionRepository.ts:568-573` reconstructs clauses for chunks above 100 IDs and omits `workplace_id`.

**Call sites**

- `src/services/reports/reportingPeriodLoader.ts:69`
- `src/services/reports/reportingDeltaEngine.ts:194`
- `src/services/wealth-service.ts:188`

**Cross-workplace path**

The same repository call is isolated for 100 account IDs and unscoped for 101. A foreign account ID in the input returns foreign transactions only after crossing that threshold. Current reporting callers usually derive IDs from scoped account lists, which lowers UI exploitability but does not repair the public repository contract.

**Bounded slice WP-1C**

Include `Q.where('workplace_id', workplaceId)` in every chunk and add a two-workplace test with 101 account IDs. One application file plus a repository test.

## P1 — isolation relies on provenance or clean data

### P1.1 — Journal enrichment accepts unscoped IDs

**Evidence**

- `src/data/repositories/journal/JournalEnrichmentQueries.ts:274-324` exposes `getEnrichmentDataRaw(journalIds)` without a workplace argument.
- Raw SQL at lines 278-293 joins journals, transactions, and accounts only by IDs.
- ORM fallback at lines 298-324 queries all three workplace-owned collections without workplace predicates.
- `src/services/journal/journalTimelineReadModel.ts:108-110` calls it after a scoped journal observation.

**Failure path**

Today's timeline supplies scoped journal IDs, but the repository API cannot enforce that provenance. A mixed ID set exposes foreign journal/account enrichment; malformed cross-workplace transaction/account links can contaminate even a scoped journal set.

**Bounded slice WP-1D**

Add `workplaceId` to the enrichment API and enforce it in raw and fallback queries. Update the timeline caller and add raw/fallback two-workplace tests. Two application files.

### P1.2 — Raw metrics scope one table, not the whole join

**Evidence**

- `src/data/repositories/raw/TransactionRawMetricsQueries.ts:88-151` scopes journals, but not transactions, in `getLatestBalancesRaw`.
- `src/data/repositories/raw/TransactionRawMetricsQueries.ts:153-239` scopes journals, but not transactions/accounts, in `getDailyDeltasGroupedRaw`; fallback account lookup at lines 200-204 is unscoped.
- `src/data/repositories/raw/TransactionRawMetricsQueries.ts:241-319` has the same gap in `getAccountDeltasGroupedRaw`.
- `src/data/repositories/raw/TransactionRawRebuildQueries.ts:17-140` scopes journals only in `getAccountSumRaw`; transaction cursor subqueries at lines 43-58 are unscoped.
- `src/data/repositories/raw/TransactionRawPatternQueries.ts:10-110` scopes recurring-pattern journals but not transactions.
- `src/data/repositories/TransactionRawRepository.ts:279-325` scopes only journals in `getTransactionsMetadataRaw`.
- `src/data/repositories/TransactionRawRepository.ts:348-408` scopes transactions but not joined journals/accounts in `getBulkAccountPeriodMetricsRaw`.
- `src/data/repositories/TransactionRawRepository.ts:449-489` scopes journals but not transactions in `observeUnreconciledMetricsRaw`.
- `src/data/repositories/account/AccountListMetricsQueries.ts:16-121` scopes accounts but not joined transactions/journals.

**Call sites**

- reports: `src/services/reports/reportingPeriodLoader.ts:45,67-68`
- integrity/rebuild: `src/services/integrity-service.ts:119,151,227`
- wealth/simulation: `src/services/wealth-service.ts:165`, `src/services/simulation/CashFlowSimulationService.ts:402`, `src/services/simulation/safeToSpendInputAcquisition.ts:151`
- insights/account reads: `src/services/insight/InsightService.ts:92`, `src/services/accounts/accountDerivedReads.ts:52`

**Failure path**

Scoped account/journal IDs usually constrain normal data. A malformed or imported cross-workplace foreign key, however, enters balances, reports, insights, reconciliation metrics, or recurring-pattern output because joined rows are not independently scoped. Raw and fallback behavior is not consistently equivalent.

**Bounded slice WP-1E**

Fix by module, not as one mega-change: metrics, rebuild sums, patterns, metadata/period metrics, then account-list metrics. For each method, predicate every workplace table in raw SQL and ORM fallback and run the same two-workplace fixture through both paths.

### P1.3 — Recent journal suggestions use partially scoped joins

**Evidence**

- `src/data/repositories/journal/JournalEnrichmentQueries.ts:74-184` scopes journals in SQL but not joined transactions/accounts.
- ORM fallback at `src/data/repositories/journal/JournalEnrichmentQueries.ts:186-272` starts with scoped journals, then queries transactions at lines 209-215 and accounts at lines 217-223 without workplace predicates.

**Failure path**

Normal journal provenance limits exposure. Cross-workplace links introduced by migration/import/corruption can still feed foreign account names/types into suggestions.

**Bounded slice WP-1F**

Add workplace predicates to every raw join and fallback collection query, with parity tests.

### P1.4 — Rebuild and integrity mutations are only indirectly scoped

**Evidence**

- `src/services/AccountingRebuildService.ts:67-87` scopes the account and rebuild data.
- `src/services/AccountingRebuildService.ts:149-155` re-fetches transaction models by ID without workplace scope.
- `src/services/AccountingRebuildService.ts:158-162` finds snapshots by account/date without workplace scope, then permanently deletes them at lines 176-179.
- `src/services/integrity-service.ts:427-439` re-fetches repaired accounts by ID without workplace scope before mutation.

**Failure path**

Transaction/account IDs currently originate from scoped calculations, so ordinary call paths are provenance-safe. Foreign snapshots referencing the same account can be deleted, and the mutation helpers normalize an unsafe pattern that breaks when provenance changes.

**Bounded slice WP-1G**

Add workplace predicates to the transaction, snapshot, and repaired-account queries. Test that rebuilding B cannot update/delete A rows, including malformed references. Two application files.

### P1.5 — Account merge repository can delete unscoped source models

**Evidence**

- `src/data/repositories/account/AccountMergeOperations.ts:17-39` receives a workplace and scopes metadata/subaccount queries.
- `src/data/repositories/account/AccountMergeOperations.ts:41-43` loads source accounts by ID only.
- `src/data/repositories/account/AccountMergeOperations.ts:65-87` prepares soft deletion of every returned source account.
- `src/services/accounts/accountMergeCommands.ts:105-116` currently validates source/target accounts through scoped repository reads before the call at lines 168-174.

**Failure path**

The service call path is safe today; the exported repository operation is not. A new caller or direct use can prepare deletion of foreign source accounts.

**Bounded slice WP-1H**

Scope the source-account query and add a repository-level two-workplace test. One application file.

### P1.6 — Planned-payment lifecycle accepts mismatched models

**Evidence**

- `src/services/planned-payment/plannedPaymentLifecycle.ts:16-74` receives `workplaceId` and a model but does not verify `pp.workplaceId` before mutation.
- `src/services/planned-payment/plannedPaymentOrchestration.ts:72-116` and `:121-168` query with the supplied workplace but create journals using `pp.workplaceId` at lines 102 and 153.
- `src/data/repositories/PlannedPaymentRepository.ts:120-125` prepares deletion from a model without workplace validation; its current caller first performs a scoped find at `src/services/planned-payment/plannedPaymentCommands.ts:76-90`.
- Public facade methods are `src/services/PlannedPaymentService.ts:51-85`.

**Failure path**

UI-observed models normally carry the active workplace. A mismatched model/workplace pair can read B's context while writing A-owned journal data, or mutate a foreign planned-payment model.

**Bounded slice WP-1I**

Make workplace/model agreement an explicit precondition at the service boundary and keep repository mutations scoped. Add direct service tests with a foreign model.

## P2 — unsafe internal surface area

### P2.1 — Generic and unused unscoped repository escape hatches

**Evidence**

- `src/data/repositories/TransactionRepository.ts:16-18` exposes `transactionsQuery(...clauses)` with no workplace requirement.
- `src/data/repositories/TransactionRawRepository.ts:60-62` and `src/data/repositories/raw/TransactionRawMetricsQueries.ts:45-86` expose generic raw-query execution.
- `src/data/repositories/AccountRepository.ts:250-257` exposes unscoped `findByIdRaw(id)`.
- `src/data/repositories/AccountRepository.ts:321-325` exposes unscoped `findAllByIdsRaw(ids)`.

No production call sites were found for the transaction generic ORM query or the two account raw ID helpers. Raw-query executors are used internally by repository modules and export/enrichment code.

**Bounded slice WP-1J**

Delete unused methods. Make raw execution private/module-local, or require a scoped query builder that cannot omit `workplaceId` accidentally.

### P2.2 — Model-instance batch writers trust callers

**Evidence**

- `src/data/repositories/journal/JournalPlannedQueries.ts:107-120` updates supplied journal models without workplace validation.
- `src/data/repositories/journal/journalWriteRepository.ts:347-452` replaces/reverses supplied models without verifying their workplace.
- `src/data/repositories/journal/journalWriteRepository.ts:458-484` bulk-renames supplied journals without a workplace parameter.
- `src/data/repositories/journal/journalWriteRepository.ts:606-669` reassigns supplied transaction/journal models without a workplace parameter.

Current production callers first load models through scoped queries: `src/services/planned-payment/plannedPaymentOrchestration.ts:133` and `src/services/journal/journalBulkCommands.ts:68-82,412-453,474-506`.

**Bounded slice WP-1K**

Keep these helpers internal to a scoped facade or add `workplaceId` plus explicit model-workplace assertions. Tests should call the repository boundary directly with mixed-workplace models.

## Clean boundaries confirmed

- `AuditRepository` enforces workplace ownership on ID reads, queries, and writes.
- `BudgetRepository` scopes budgets and scopes; `BudgetWriteService` validates referenced accounts before create/update.
- `TransactionAutoPostRuleRepository` scopes reads, writes, deletion, and account-merge rewrites.
- `journalQueryRepository`, `JournalObserveQueries`, `SmsJournalQueries`, and `journalMetadataRepository` enforce workplace scope on primary reads.
- `BalanceSnapshotRepository` scopes primary snapshot reads/writes; only the rebuild-side deletion query needs repair.
- `TransactionRepository` primary CRUD/list/observe methods are scoped except the explicitly identified >100 branch and unsafe generic helper.
- `src/data/repositories/raw/TransactionRawRebuildQueries.ts:142-201` enforces both transaction and journal workplace scope in `getRebuildDataRaw` in raw and ORM paths.
- Current SMS preview, rule, and linked-journal reads outside the scan lookup are workplace-scoped. `SmsRuleEngine` starts from scoped journals/accounts, though its intermediate transaction lookup should eventually receive the same defense-in-depth treatment as P1.2.

## Recommended execution order

1. **WP-1A, WP-1B, WP-1C:** land the three direct P0 fixes independently.
2. **WP-1D:** close journal enrichment's public unscoped contract.
3. **WP-1E and WP-1F:** establish raw/ORM parity module by module.
4. **WP-1G, WP-1H, WP-1I:** harden mutation boundaries.
5. **WP-1J and WP-1K:** delete/internalize unsafe escape hatches and provenance-only writers.

Each slice should use two workplaces with deliberately overlapping external identifiers or malformed cross-links. A test passes only if A's rows are absent from B's read result and byte-for-byte unchanged after B's mutation.

## Audit method and coverage

The audit traced the 12-table declaration through:

- every production repository file that references those tables;
- raw SQL plus corresponding ORM fallbacks;
- repository call sites in services for exports, account merge, integrity/rebuild, SMS, journals, planned payments, budgets, reports, wealth, insights, and simulation;
- ID-based helpers and model-instance mutation helpers;
- migration/import staging, reset, purge, and genuinely global-table exceptions.

Searches included collection `find`/`query` calls, raw table references/joins, public methods with optional or absent workplace parameters, and downstream call-site provenance. Tests and UI-only presentation code were used to understand callers but were not treated as persistence boundaries.

This is a static architecture audit. It does not prove runtime isolation; the bounded slices above require executable two-workplace tests on both raw and fallback paths.
