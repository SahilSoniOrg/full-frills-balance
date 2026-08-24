# Architecture Refactor Remediation Plan

Status: **ACTIVE — disposable rebuild delivery restored; native device proof remains open**
Baseline: `b1ee4d45` on `main`; verified local head before this documentation refresh: `0ff90512`
Owner: orchestration thread; implementation work is delegated to isolated Luna worktrees.
Push policy: **never push**. Local commits are expected; completed work is squash-merged into `main`.

## Objective

Close the remaining lifecycle, workplace-isolation, financial-integrity, persistence-ownership, and verification gaps found after the architecture refactor. Keep the application behavior stable while making cancellation and transaction ownership truthful and testable.

## Current verification baseline

- `bun run verify` passes locally: architecture checks, typecheck, E2E typecheck, Jest, and lint. The latest merged-tree run is recorded below.
- The working tree is clean.
- The architecture ratchet currently reports three approved direct database-write occurrences in testing helpers.
- No implementation agent may edit files owned by another workstream.

## Local merge ledger

The unpushed remediation work was implemented in isolated `gpt-5.6-luna` worktrees, reviewed by the orchestrator, and is now consolidated into seven local logical commits immediately after `origin/main`. The pre-consolidation chain remains recoverable under `codex/pre-history-cleanup`; nothing was pushed.

The consolidated tree contains these logical waves:

- journal/import workflow refactors;
- account-management, selection, and hierarchy work;
- architecture and domain-boundary cleanup;
- lifecycle cancellation and workplace-isolation hardening;
- repository ownership migration and persistence ratchets;
- rebuild-delivery evaluation, durable-outbox removal, and disposable MMKV restoration;
- real-writer tests, adapter-contract fault injection, architecture reports, and final verification records.

Slice-level verification passed in the worktrees: SMS 42 tests; lifecycle/reactive 21 tests; financial cancellation 39 tests; import/account 65 tests; ratchet and formatting checks passed.

Second-wave slice verification passed in the worktrees: rebuild recovery 10 tests; planned-payment atomicity 38 tests; SMS repository ownership 44 tests. The SMS targeted command exited nonzero only because its isolated coverage threshold was not met; all 44 targeted tests passed.

Third-wave slice verification passed in isolated Luna worktrees: rebuild ownership 13 tests; journal lifecycle ownership 17 tests; account-merge ownership 37 tests; integrity refresh 9 tests; planned-payment ownership 46 tests; export ownership 9 tests; post-commit callback semantics 3 tests. All accepted slices were reviewed and squash-merged locally.

## Prior durable-outbox verification (historical)

The following verification covered the durable-outbox experiment before it was intentionally removed:

- Architecture checks and all ratchets passed: `direct_database_write=3`, `service_model_persistence_access=0`.
- E2E TypeScript check passed.
- Jest: 277 suites passed; 1,663 tests passed; 1 skipped.
- Lint completed without errors.
- `git diff --check` passed; no commits were pushed.

## Current verification

Verified on the merged tree at `4548d974` (code changes through `0ff90512`):

- Targeted adapter/transaction-owner coverage: 5 suites, 21 tests passed.
- Architecture checks and all ratchets passed: `direct_database_write=3`, `service_model_persistence_access=0`.
- E2E TypeScript check and application TypeScript check passed.
- Jest: 274 suites passed; 1,643 tests passed; 1 skipped.
- Lint and `git diff --check` passed; no commits were pushed.

The native SQLite/JSI claim remains explicitly narrowed because this environment cannot provide device-level execution.

## Deferred work that remains explicit

- A queued rebuild can be lost on process death by design. The source journal/transaction data remains authoritative; startup integrity, manual force-rebuild, and later mutations are the recovery paths for stale projections.
- The adapter contract now has fault injection after every staged-import DELETE/UPDATE boundary, with row restoration and cache-notification assertions. Device-level iOS/Android SQLite/JSI execution and native cache-coherence proof remain unproven.
- Playwright remains scheduled/manual by policy, not a pull-request gate.
- Some higher-level integrity/import tests still mock boundaries, but real-writer coverage now exists for the critical cancellation and rollback paths. Native device fault injection remains the final evidence gap.
- Planned-payment due-horizon generation still has a read-before-write concurrency window for duplicate occurrence days.
- Named cross-domain coordinators remain deferred; repository writers currently own the business batches and the ratchet prevents service leakage.

## Adversarial follow-up slices

The post-merge Luna review confirmed these additional gaps; they are now part of the active goal:

### Slice 8 — Cancelled rebuild marker recovery (P1) — COMPLETE

- `src/services/RebuildQueueService.ts:204-210` clears in-memory work but leaves `PROCESSING_KEY` behind.
- An in-flight marker is written at `:338-352`, cleanup is skipped after generation changes at `:401-404`, and startup re-enqueues it at `:85-99`.

Required outcome: stopping a workplace cannot resurrect its cancelled in-flight batch after restart, while genuine crash recovery remains intact. Add restart/recovery coverage.

Landed in `d7ce7c6d`; restart and genuine-crash recovery coverage passed.

### Slice 9 — Planned-payment journal and schedule atomicity (P1) — COMPLETE

- `src/services/planned-payment/plannedPaymentOrchestration.ts:252-260` creates the journal.
- `src/services/planned-payment/plannedPaymentOrchestration.ts:285-287` advances `nextOccurrence` in a later write.
- The persistence inventory must not claim this path is atomic until a coordinator owns both mutations.

Required outcome: journal creation and schedule advancement commit or roll back together, with failure-between-writes coverage.

Landed in `793f26a3`; merged-tree integration coverage passed.

### Slice 10 — SMS preparation ownership (P2) — COMPLETE

- `src/services/sms/pipeline/smsInboxRecordPreparer.ts:64-77` still calls model `prepareUpdate`/`prepareCreate` directly.
- These two occurrences were explicitly baselined during the first pass and are now removed from the baseline.

Required outcome: move model preparation into the inbox repository/coordinator while keeping analysis pure and preserving workplace-scoped idempotency.

Landed in `25a5b50b`; the service-model ratchet entries are gone.

### Slice 11 — Real transaction-owner integration coverage (P2) — COMPLETE

Add integration coverage that exercises actual database writers for cancellation and rollback. Current tests mock `rebuildAccountBalances` and `createJournal`, and the inbox repository test uses a fake writer; these prove orchestration but not durable commit behavior.

Landed in `0ff90512`. Real writers are exercised for integrity repair cancellation, planned-payment cancellation, SMS inbox cancellation, and failed import staging. The tests assert persisted rows and after-commit effects, not merely mocked orchestration.

### Slice 12 — Repository ownership ratchet closure (P1/P2) — COMPLETE

All service/command `prepare*`, model update, and private `_raw` occurrences are now repository-owned. The ratchet reports `service_model_persistence_access=0`; direct database writes remain limited to the three approved test harness entries.

### Slice 13 — After-commit callback boundary (P1) — COMPLETE

`persistBatch` now invokes callbacks only after `database.write` resolves successfully and never for empty or failed batches. Rebuild enqueue is an after-commit trigger for disposable projection work; callbacks remain appropriate for analytics and cache effects.

### Slice 14 — Durable rebuild intent outbox — REMOVED BY REQUIREMENT CLARIFICATION

The original roadmap defines rebuilds as recoverable projection work: the queue retries transient failures, `flush()` awaits scheduled retries, and startup integrity can trigger a larger repair. The clarified product requirement is stronger: journals and transactions are authoritative, while balances and snapshots may be rebuilt again at account or workplace scale. A lost pending rebuild request therefore creates stale derived data until the next trigger; it does not lose financial truth.

The durable outbox was implemented experimentally across 13 producer paths, then removed in `3c993643`. It added schema, model, repository, export, purge, lease, retry, and migration machinery for a guarantee the product does not require. MMKV remains the correct scheduler for disposable rebuild work: enqueue after the business commit, coalesce by workplace/account and earliest boundary, retry in-process, and recover with startup integrity/manual force-rebuild paths.

The durable series (`d8221fd3` through `222679b6`) remains in history as an explicitly superseded experiment. Its lease/CAS, process-death, and export concerns are no longer acceptance criteria.

### Slice 15 — Native staged-import rollback proof (P1) — CLAIM NARROWED; ADAPTER CONTRACT COMPLETE

Landed in `6bc8a124`. `DatabaseRepository.adapter-contract.test.ts` exercises the real raw-adapter extraction path and injects failures after each DELETE/UPDATE boundary, asserting savepoint rollback/release, row restoration, and no cache notifications. This proves the application adapter contract and keeps the atomicity claim explicitly narrowed. It does not prove native SQLite/JSI behavior on iOS or Android; that requires a device-capable test environment.

## Risk-ordered workstreams

### Slice 1 — Lifecycle cancellation and stale derived writes (P0/P1)

Owner: lifecycle coordinator / reactive services.

Evidence:

- `src/services/RebuildQueueService.ts:204-211,356-366` increments the lifecycle generation and clears queued work, but an in-flight batch does not check generation between items and receives no abort signal.
- `src/services/reactive/reactiveAggregatedBalances.ts:89-150` performs asynchronous work in `switchMap` and saves a wealth snapshot after eviction can unsubscribe the stream.
- `src/features/app/hooks/useAppBootstrap.ts:80-85` starts Safe-to-Spend prewarming without cancellation.
- `src/services/simulation/SafeToSpendReadModel.ts:43-47,77-97` clears only the cache map; it does not dispose an active prewarm subscription.

Required outcome:

- Old workplace work cannot publish snapshots or process later queue items after a switch.
- Cancellation reaches the final derived-write/commit boundary.
- Queue `stop()` remains truthful about pending work.

Tests required:

- Stop a two-item rebuild batch while the first item is blocked; assert the second item is not processed.
- Evict a reactive workplace while calculation is awaiting; assert no snapshot write occurs afterward.
- Dispose Safe-to-Spend prewarm during projection; assert no stale snapshot write.

### Slice 2 — Cross-domain cancellation at commit boundaries (P1)

Owner: integrity and planned-payment coordinators.

Evidence:

- `src/services/integrity/integrityOrchestrator.ts:250-275` checks cancellation only between repairs.
- `src/services/integrity/integrityRepair.ts:45-60` does not accept or forward a signal to rebuild.
- `src/services/planned-payment/plannedPaymentOrchestration.ts:221-249` checks cancellation only between occurrences.
- `src/services/planned-payment/plannedPaymentJournalGeneration.ts:19-50` creates the journal without cancellation support.

Required outcome:

- A workplace switch cannot commit an integrity repair or planned journal after cancellation.
- Signals are checked immediately before transaction preparation and inside the coordinator that owns the write.

Tests required:

- Abort during integrity rebuild preparation; assert no repair batch commits.
- Abort between planned-payment existence check and journal creation; assert no journal commits.

### Slice 3 — SMS workplace isolation and transactional cancellation (P1)

Owner: SMS pipeline/repository boundary.

Evidence:

- `src/services/sms/pipeline/smsSyncPipeline.ts:29-60` stores processed SMS IDs under one global key.
- `src/services/sms/pipeline/smsSyncPipeline.ts:217-236` performs asynchronous rereads after the last cancellation guard.
- `src/data/repositories/TransactionInboxRepository.ts:70-77` batches the callback result without a signal or final guard.

Required outcome:

- Processed-ID state is workplace-scoped or removed as an independent source of truth.
- The transaction coordinator rejects stale work before batching.
- Existing per-workplace single-flight and post-commit processed-ID behavior remain intact.

Tests required:

- Same device SMS ID in two workplaces must not cross-suppress processing.
- Abort during transaction rereads must produce zero database operations.
- Concurrent scans for one workplace remain serialized; different workplaces remain independent.

### Slice 4 — Import outcome semantics and native rollback proof (P1)

Owner: import transaction coordinator / database repository.

Evidence:

- `src/services/import/importStaging.ts:49-58` swaps the target and then separately deletes staging data.
- `src/services/import/ImportService.ts:111-132` reports a failed import if cleanup fails after a successful swap.
- `src/data/repositories/DatabaseRepository.ts:177-237` uses a private-adapter savepoint, but native rollback behavior is not integration-tested.

Required outcome:

- Import state is explicit and resumable, or post-swap cleanup is idempotent and cannot turn a successful replacement into a reported failure.
- Native adapter fault injection proves rollback of partial swap and cache synchronization behavior.

Tests required:

- Fail staging cleanup after a successful swap; assert the import result is successful and cleanup is retryable.
- Inject a failure during table reassignment; assert target rows are restored and staging rows remain available.
- Run the swap through the real raw-adapter extraction path with fault injection. Device-native SQLite/JSI execution remains outside this environment and is explicitly unproven.

### Slice 5 — Account-tree invariant hardening (P1)

Owner: account-tree domain validator.

Evidence:

- `src/services/accounts/accountTree.ts:351-363` validates parent existence and type but not `parent.deletedAt`.
- `src/services/accounts/accountHierarchyCommands.ts:677-690` rejects archived parents but not deleted parents.
- `src/services/accounts/__tests__/accountTree.test.ts:182-203` lacks a deleted-parent case.

Required outcome:

- Deleted accounts cannot become parents.
- The invariant is enforced in the shared validator and covered by domain and command-level tests.

### Slice 6 — Persistence ownership and enforcement (P1/P2)

Owner: repository/coordinator layer plus architecture ratchet.

Evidence:

- `scripts/check-architecture-ratchets.mjs:45-47,265-277` now detects direct database writes and service-owned `prepare*`, model updates, and private raw access.
- The formerly service-owned preparation paths have migrated to repositories; the ratchet now mechanically rejects regressions.
- `docs/architecture/PERSISTENCE_OWNERSHIP_INVENTORY.md:12` records the current three approved test-only direct-write occurrences; the service/command persistence baseline is zero.

Required outcome:

- Either move remaining cross-domain preparation into named repositories/coordinators or explicitly codify the allowed preparer seam.
- The service/command persistence ratchet is active at a zero baseline; new bypasses fail architecture verification.
- Preserve legitimate migration/import/test seams with explicit allowlists and rationale.

Tests and verification required:

- Ratchet self-tests for service-owned `prepare*`, model `.update`, raw/private adapter access, and approved seams.
- Focused tests for each migrated coordinator.
- Full architecture check after every ownership slice.

### Slice 7 — CI and contract coverage (P2)

Owner: verification/docs.

Evidence:

- `.github/workflows/playwright.yml:3-7` runs only on schedule or manual dispatch.
- `.github/workflows/ci.yml:3-46` does not run Playwright on pull requests.
- `src/services/import/__tests__/ImportService.workflow.test.ts:8-62` mocks repository, database, staging, and integrity behavior, so it does not exercise import persistence.

Required outcome:

- Decide and document whether web E2E is a PR gate or a scheduled confidence suite.
- [x] Add an import persistence integration contract that exercises staging, failed materialization, cleanup, and target preservation (`src/services/import/__tests__/ImportService.workflow.integration.test.ts`).

## Merge protocol

1. Each workstream uses a separate worktree and a `codex/` branch.
2. Agents commit only their owned files and report commit SHA, tests, and unresolved risks.
3. Orchestrator reviews the diff and tests before merging.
4. Completed work is squash-merged into `main` as one focused commit per slice.
5. No pushes, force operations, or destructive cleanup.
6. After each merge, run the slice tests plus architecture checks; after the final merge, run `bun run verify`.

## Definition of done

- Slices 1–5 have implementation and regression tests.
- Slice 6 closes the ownership gap for service/command persistence mechanics; remaining exceptions are explicit test/infrastructure seams.
- Import rollback is covered at the adapter contract and real workflow levels; the native SQLite/JSI claim is explicitly narrowed and remains a device-level follow-up.
- Current docs match the actual ratchet and remaining risks.
- Full verification passes on `main`.
- This document records merged commits, verification results, and any consciously deferred work.
