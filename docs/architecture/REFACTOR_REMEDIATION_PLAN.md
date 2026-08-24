# Architecture Refactor Remediation Plan

Status: **ACTIVE — durable rebuild delivery verified; native and transaction-owner integration debt remains**
Baseline: `b1ee4d45` on `main`; verified local head before this documentation refresh: `222679b6`
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

All changes below were implemented in isolated `gpt-5.6-luna` worktrees, reviewed by the orchestrator, squash-merged into `main`, and not pushed:

- `73ad745` — isolate SMS scans and honor cancellation.
- `ce7a1ffa` — cancel stale workplace reactive work.
- `c7b33970` — guard financial rebuilds against cancellation.
- `c6a05c0d` — make staged import cleanup retryable and cover savepoint rollback.
- `6d73615` — reject deleted account-tree parents.
- `7117459` — ratchet service/command model persistence access.
- `b13e9e6` — refresh persistence enforcement inventory and E2E policy documentation.
- `d7ce7c6d` — prevent cancelled rebuild resurrection after restart.
- `793f26a3` — atomically advance planned-payment schedule with journal creation.
- `25a5b50b` — move SMS inbox model preparation into the repository.
- `6da8cb1b` — move rebuild preparation into repositories.
- `2db1d13e` — move journal lifecycle preparation into the repository.
- `7c266523` — move budget and planned-payment merge preparation into repositories.
- `35d0abc1` — move integrity refresh preparation into the account repository.
- `1aac5930` — delegate account-merge transaction preparation.
- `4d70f8ed` — run `persistBatch` callbacks after the writer resolves.
- `136b2777` — move export ORM projection into the data layer.
- `b6c2e7c0`, `9c5b19a7` — ratchet completed rebuild/lifecycle/integrity ownership migrations.
- `df396a2b` — revert an incomplete rebuild slice after focused tests caught missing repository helpers; no incomplete implementation was retained.
- `0cb78220` — record the durable rebuild outbox audit and ownership closure.
- `d8221fd3`, `d8f700fc`, `32eb4f4b`, `d881875d` — add schema, model, repository, and atomic batch support for durable rebuild intents.
- `6de63e2d` — include rebuild intents in workplace purge/export/staged-import table ownership.
- `728ab437`, `36c8c13b`, `708dfdb0`, `4ecdc306`, `a92959a9`, `793bc337`, `f4b01072`, `491c0947`, `beb0bf3e` — migrate account, ledger, journal, bulk, merge, and SMS producers to same-writer durable intent insertion.
- `e4e0ed06`, `74617530`, `f1f541b9` — remove the obsolete enqueue helper, type intent status, and refresh producer expectations.
- `3c574056`, `e468d4a8`, `50fd3d1d`, `bee3040d` — implement and harden the durable dispatcher, lease recovery, retry retention, and repository-owned dispatcher writes.
- `222679b6` — complete rebuild-intent export/summary coverage and update SMS batch fixtures for the durable seam.

Slice-level verification passed in the worktrees: SMS 42 tests; lifecycle/reactive 21 tests; financial cancellation 39 tests; import/account 65 tests; ratchet and formatting checks passed.

Second-wave slice verification passed in the worktrees: rebuild recovery 10 tests; planned-payment atomicity 38 tests; SMS repository ownership 44 tests. The SMS targeted command exited nonzero only because its isolated coverage threshold was not met; all 44 targeted tests passed.

Third-wave slice verification passed in isolated Luna worktrees: rebuild ownership 13 tests; journal lifecycle ownership 17 tests; account-merge ownership 37 tests; integrity refresh 9 tests; planned-payment ownership 46 tests; export ownership 9 tests; post-commit callback semantics 3 tests. All accepted slices were reviewed and squash-merged locally.

## Post-merge verification

The final merged-tree `bun run verify` completed successfully after all accepted remediation waves:

- Architecture checks and all ratchets passed: `direct_database_write=3`, `service_model_persistence_access=0`.
- E2E TypeScript check passed.
- Jest: 277 suites passed; 1,663 tests passed; 1 skipped.
- Lint completed without errors.
- `git diff --check` passed; no commits were pushed.

## Deferred work that remains explicit

- Durable rebuild intents are now inserted in the same Watermelon batch as migrated business mutations. The compatibility `RebuildQueueService.enqueue*` API remains for legacy callers and persists through the repository; no production producer should use it.
- Savepoint rollback coverage simulates native-adapter behavior; device-level iOS/Android JSI execution remains unproven.
- Playwright remains scheduled/manual by policy, not a pull-request gate.
- Integrity cancellation and several rollback tests still mock the rebuild boundary; add real-writer/fault-injection integration cases before claiming full transaction-owner coverage.
- Planned-payment due-horizon generation still has a read-before-write concurrency window for duplicate occurrence days.
- Named cross-domain coordinators remain deferred; repository writers currently own the durable batches and the ratchet prevents service leakage.

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

### Slice 11 — Real transaction-owner integration coverage (P2)

Add integration coverage that exercises actual database writers for cancellation and rollback. Current tests mock `rebuildAccountBalances` and `createJournal`, and the inbox repository test uses a fake writer; these prove orchestration but not durable commit behavior.

Still pending; this is the next verification tranche.

### Slice 12 — Repository ownership ratchet closure (P1/P2) — COMPLETE

All service/command `prepare*`, model update, and private `_raw` occurrences are now repository-owned. The ratchet reports `service_model_persistence_access=0`; direct database writes remain limited to the three approved test harness entries.

### Slice 13 — After-commit callback boundary (P1) — COMPLETE

`persistBatch` now invokes callbacks only after `database.write` resolves successfully and never for empty or failed batches. Mandatory rebuild delivery has since moved into same-writer `rebuild_intents` operations; callbacks remain appropriate for analytics and cache effects.

### Slice 14 — Durable rebuild intent outbox (P0/P1) — COMPLETE

The Luna durability sweep traced 13 production enqueue paths across ledger create/reversal/update/lifecycle, journal bulk operations, account hierarchy/create/merge, and SMS scan. All migrated paths now pass typed `rebuildIntentRequests` into repository-owned writers; no production producer remains on the volatile enqueue path.

Landed bounded slices:

1. `d8221fd3`–`d8f700fc`: schema v32, model, status typing, and repository operations for append-only intent rows.
2. `32eb4f4b`–`beb0bf3e`: same-writer intent preparation across all producer slices, including custom writers and SMS batch persistence.
3. `3c574056`–`50fd3d1d`: dispatcher lease recovery, retry retention, legacy MMKV migration, and repository-owned state transitions.
4. `222679b6`: export and summary coverage for the workplace-owned intent table.

Proof currently present: business-write failure rolls back intent insertion; rebuild failure retains intent for retry; legacy queue migration is loss-aware; replay acknowledgement is durable; deliberate stop leaves durable rows intact. Native SQLite/JSI crash/restart proof remains deferred.

### Slice 15 — Native staged-import rollback proof (P1) — PENDING

The Luna rollback sweep found no safe commit. Existing tests use a mocked raw adapter and in-memory savepoint behavior; they do not prove device SQLite/JSI rollback. Strengthen the adapter contract test only when it can be rerun and verified, and keep the atomicity claim explicitly narrowed until then.

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
- Run the swap against the native adapter, not only mocks.

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
- Add at least one import persistence integration contract that exercises staging, swap, cleanup, and rollback semantics.

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
- Import native rollback behavior is proven or the atomicity claim is narrowed.
- Current docs match the actual ratchet and remaining risks.
- Full verification passes on `main`.
- This document records merged commits, verification results, and any consciously deferred work.
