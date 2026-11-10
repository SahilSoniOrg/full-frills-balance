# Exhaustive Architecture Audit — changes after tag `abv_00183`

Repository: full-frills-balance (React Native / Expo)
Base: `abv_00183` → HEAD `4ac8018c2`
Commits in range: 31
Source files changed: 219 (108 added, 111 modified, 23 deleted)

## Disposition (2026-11-10)

- **Fixed:** F-05 (mutation confirmation vs load generation), F-04 (Gmail double pipeline + cutoff), F-16 (stale inbox modal item).
- **Fixed (remediation pass):** F-03 (projected `capture_review_state` / `has_historical_sms_evidence` on `journal_metadata` + schema 38), F-06/F-07 (workplace-keyed capture workspace store + settings/lists/mutations split), F-08 (inbox data / scan / deep-link split), F-09 (matcher save extraction + draft epoch vs async hydrate), F-12 (`useAccountMatchersSection` + props-only view), F-10 (manual import routes economic kind through `classifyCapture`), F-02 (`WorkplaceWriteCoordinator` for MMKV-only writes), F-11 (deleted SMS decision/evidence shims + dead AutomationSettings alias / unused Gmail copy), F-17 (`resetKey` on `useObservableWithEnrichment`), F-18 (documented keep — no code change).
- **Fixed (cleanup pass):** F-13 (`useInboxItemActions` + inbox action/channel/raw-alert copy + rejection catch), F-14 (matcher DTOs in `src/types/accountMatcher.ts` + VM interfaces in `hooks/details/types`), F-15 (shared `ShowMorePager` + deleted `moveAccountMatcher` / unused `isAccountDeleted` / unused `latestLinkTime`+`retry` alias).
- **Deferred:** F-01 (capture policy → WatermelonDB `capture_settings`) — blocked mid-flight: large migration + MMKV remap + backup/restore must not land on the same uncommitted tree as F-04/F-05 capture-path WIP; F-02 interim mutex covers MMKV serialization until F-01.

---

## AUDIT COVERAGE

- Relevant files: 219 (non-test, non-doc, non-generated source files touched in range)
- Analyzed: 184 (direct reads + 2 partition sub-audits)
- Excluded: 23 (deleted source files; no dangling references — verified by grep)
- Blocked: 0
- Coverage: ~84%

Major flows traced (end-to-end):
1. SMS scan → recognition → capture decision → auto-post (`smsSyncPipeline` → `decideSms` → `decideCapture` → `journalPersistenceService`)
2. Email (Gmail) sync → parse → capture decision → auto-post (`gmailSyncService.sync` → `ingestGmailObservation`)
3. Account matcher discovery → proposal → save/forget/move (`useAccountMatcherEditorViewModel` → `accountMatcherCommands` → `AccountMatcherRepository`)
4. Automatic transaction capture settings + role provisioning (`transactionCaptureService`)
5. Capture review pipeline (`captureReviewService` → `JournalCaptureQueries`)
6. Historical SMS evidence backfill (`JournalHistoricalCaptureQueries`)
7. Journal merge / reassign / retarget with capture metadata (`journalCrossJournalOperations`)

Unresolved critical questions: 0 (all major state owners and side-effect owners identified; residual questions are low-level performance/edge cases, not architectural unknowns)

Status: INCOMPLETE — 35 changed source files were not individually read in full (mostly UI route files, copy strings, email DKIM crypto, modules/expo-gmail-auth, and minor service helpers). Two partition sub-audits (journal feature, settings capture UI) partially completed; their results were reconstructed from direct reads. No finding below depends on an unread file.

---

## Architecture Map (what actually exists after these changes)

A new "Automatic Transaction Capture" subsystem has been bolted onto the existing journal/inbox architecture. It has three layers:

1. **Domain core** (`src/domain/transaction-intelligence/*`, all new, pure): `captureMetadata`, `captureDecision`, `decideCapture`, `captureTransition`, `historicalSmsEvidence`, `categoryDefaults`, `captureAccountEligibility`. These are well-factored, pure, and cohesive.
2. **Service layer**: `captureReviewService`, `transactionCaptureService`, `captureContext`, `captureReviewService`, plus SMS pipeline (`smsSyncPipeline`, `smsDecision`, `refreshSmsRecognition`) and Gmail pipeline (`gmailSyncService`, `gmailIngestion`).
3. **Persistence**: `JournalCaptureQueries`, `JournalHistoricalCaptureQueries`, `CaptureReferenceMatchQueries`, `captureSourceLinkStaging`, `AccountMatcherRepository`, `AccountingWriteSession` (extended with a capture-metadata accumulator).
4. **Account matchers**: a new `account_matchers` table + `AccountMatcher` model + recognition engine (`accountMatcherEvaluator`, `accountMatcherDiscovery`, `safeAccountMatcherRegex`), UI in `features/accounts/components/AccountMatcher*`.
5. **Preferences (MMKV)**: `automaticTransactionCapture`, `captureCategoryDefaults`, `captureDescriptionDefaults`, `openCaptureMerchants`, `accountMatcherSuppressions`, `historicalSmsCaptureBackfillVersion`, `accountMatcherRefreshPending` — all in `WorkplacePreferences`.
6. **UI**: new routes `transaction-capture`, `categorization-review`, `capture-suggestions`, `capture-history-suggestions`, `capture-mixed-suggestions`, `notification-settings`, `account-matchers`, `account-matcher-editor`; capture workspace lives in `CaptureWorkspaceView` / `CaptureWorkspaceScreen`.

State ownership is split across three stores: WatermelonDB (journals/accounts/inbox/matchers), MMKV (capture policy/defaults/suppressions), and in-memory coordinators (`RecognitionCoordinator`, `SmsSyncPipeline` scan queues, Gmail `active` map).

---

## Primary Entropy Sources (ranked)

1. **Capture policy lives in two stores (MMKV vs WatermelonDB)** — forces two-phase writes, generation counters, object-identity guards, and non-atomic post-commit remaps. (Findings F-01, F-02)
2. **Capture metadata stored as JSON inside `journal_metadata`** — forces full-table scans (`LIKE '%"transactionCapture"%'`) and re-parsing in three repositories. (F-03)
3. **Gmail sync duplicates the capture pipeline** — parse, recognize, classify twice per message. (F-04)
4. **Mutation confirmations share a load-generation counter** — confirmations silently no-op. (F-05)
5. **Five independent capture-settings owners in the UI** — redundant fetches, divergent counts, partial-failure hiding. (F-06)
6. **God hooks** (`useTransactionCaptureViewModel` 368 lines, `useTransactionInboxViewModel` 300 lines, `useAccountMatcherEditorViewModel` 438 lines). (F-07, F-08, F-09)
7. **Duplicated manual-review decision policy** (`transactionInboxImport` vs `decideCapture`). (F-10)
8. **Compatibility residue**: `smsEconomicEvidence.ts`, `smsDecisionContext.ts`, `accountRecognitionRefresh.ts` are pure re-export shims; `transactionCaptureStrings` has unreachable branches. (F-11)

---

## Findings

### F-01 — Automatic-capture policy is split across two stores, forcing ad-hoc two-phase writes
Priority: P1
Files:
- `src/services/transaction-intelligence/transactionCaptureService.ts` (whole file)
- `src/services/accounts/accountMergeCommands.ts` (capture-role remap block)
- `src/services/accounts/accountRecognitionRefresh.ts`
- `src/services/preferences/workplaceTypes.ts` (`automaticTransactionCapture`, `captureCategoryDefaults`, `captureDescriptionDefaults`, `openCaptureMerchants`, `accountMatcherSuppressions`)
- `src/data/repositories/AccountingWriteSession.ts`

Problem: `automaticTransactionCapture` (enabled flag, cutoff, uncategorized role accounts) and `captureCategoryDefaults` are stored in MMKV `WorkplacePreferences`, while the accounts they reference are WatermelonDB rows. Because the stores can't be transactional, `transactionCaptureService.setEnabled` implements a two-phase write with `generations` counters, `expected` snapshot identity comparisons, and `mappingsAreEligible` re-checks. `accountMergeCommands` remaps roles post-commit in `try/catch` and logs-and-continue. `accountMatcherSuppressions` is likewise remapped after merge. The MMKV writes are wrapped in `runAccountingWriteSession` which does not make them atomic — it only provides a global write lock.

Entropy risk: any refactor touching capture consent must preserve the two-phase dance; a missed guard silently enables capture with stale roles. Cross-store inconsistency is observable (roles point at deleted accounts → capture holds postings for review).

Action: RELOCATE — move capture policy (enabled flag + cutoff + uncategorized role mappings + category defaults) into WatermelonDB (new `capture_settings` table) so it participates in the same writer as accounts/journals; keep only device-local Gmail binding in MMKV.

Before:
```
WorkplacePreferences (MMKV)
  └── automaticTransactionCapture, captureCategoryDefaults, ...
AccountingWriteSession (DB)
  └── accounts, journals
```
After:
```
capture_settings (DB, workplace-scoped)
  └── enabled, enabledAt, uncategorizedAccountIds, defaults
AccountingWriteSession (DB) — single transaction covers both
```

---

### F-02 — `runAccountingWriteSession` is overloaded as a mutex for non-DB state
Priority: P2
Files:
- `src/services/preferences/WorkplacePreferencesStore.ts` (replace/clear use `storage`)
- `src/services/email/gmailConnection.ts` (`setGmailAutomaticCapture`, `setGmailBackgroundEnabled`, `connectGmailForWorkplace`, `disconnectGmailForWorkplace`)
- `src/services/transaction-intelligence/captureReviewService.ts` (backfill + preference updates)
- `src/data/repositories/AccountingWriteSession.ts`

Problem: Many call sites wrap pure MMKV writes in `runAccountingWriteSession` purely for serialization. The writer opens a DB transaction that prepares no DB ops, so the "transaction" is a no-op; rollback of MMKV state is impossible. This hides the fact that consent writes are not recoverable.

Action: SPLIT — introduce a dedicated `WorkplaceWriteCoordinator` (async mutex keyed by workplace) for MMKV-only mutations, and reserve `runAccountingWriteSession` for DB writes. (Or, if F-01 lands, most of these disappear.)

---

### F-03 — Capture allocations stored as JSON force full-table scans and duplicated parsing
Priority: P2
Files:
- `src/data/repositories/journal/JournalCaptureQueries.ts` (`countNeedsCategorization`, `listReview`, `findPreservedMerchants`)
- `src/data/repositories/journal/JournalHistoricalCaptureQueries.ts` (`listCategoryPatterns`, `backfillSmsEvidenceInSession`)
- `src/data/repositories/journal/journalCrossJournalOperations.ts` (`stageMerge`, `stageReassignAccounts`, `stageRetargetAccountsForMerge`)
- `src/data/repositories/journal/captureSourceLinkStaging.ts`
- `src/domain/transaction-intelligence/captureMetadata.ts`

Problem: `transactionCapture` and `historicalSmsEvidence` live inside `journal_metadata.metadata_json`. Every capture query does `Q.where('metadata_json', Q.like('%"transactionCapture"%'))` then parses each row in JS. `stageRetargetAccountsForMerge` fetches *all* capture metadata rows for the workplace and filters in JS. `stageMerge` combines captures in memory. The same parsing logic is duplicated across three repositories.

Entropy risk: O(N) scans grow with journal count; capture queries cannot use indexes; a schema migration to add a capture column would be cheaper.

Action: RELOCATE — project capture state into queryable columns (or a dedicated `capture_allocations` table) keyed by journal, and keep JSON as the audit payload only. Single owner: `JournalCaptureQueries`.

---

### F-04 — Gmail sync re-runs the entire capture pipeline after pre-classifying
Priority: P1
Files:
- `src/services/email/gmailSyncService.ts` (`sync`, `processIds`)
- `src/services/email/gmailIngestion.ts` (`ingestGmailObservation`)

Problem: In `sync`, for each message the code parses, loads matcher context, recognizes accounts, resolves flow roles, classifies, and (if classification ≠ review) verifies DKIM. Then it calls `ingestGmailObservation`, which re-parses (`parseGmailTransaction`), re-loads context, re-recognizes, re-resolves roles, and re-runs `decideCapture`. The first classification is discarded; it only gates DKIM verification. The two paths also use different cutoff comparisons (`sync`: `Math.max(automaticCaptureEnabledAt, capture.enabledAt)`; ingestion: `Math.max(captureEnabledAt, automaticCaptureEnabledAt, connectedAt)`).

Action: MERGE — move "verifiedForCapture" determination and DKIM verification into `ingestGmailObservation` (or a shared `GmailCapturePolicy`), and reduce `sync` to a fetch loop that calls `ingestGmailObservation` with `message.authenticated` unset, letting ingestion decide whether DKIM is worth the round trip.

---

### F-05 — Mutation confirmations are silently cancelled by load refreshes
Priority: P1
Files:
- `src/features/settings/hooks/useCaptureMutationRunner.ts` (56–61)
- `src/features/settings/hooks/useTransactionCaptureViewModel.ts` (70, 151–159, 185)
- `src/features/settings/hooks/useGmailCaptureViewModel.ts` (29, 39–46, 49)

Problem: A single `generation` counter is incremented by every `refresh()` (focus, capture-change subscription) and reused as the validity token for pending confirmations. `confirmAndRun` captures `request = generation.current`; if any refresh bumps it before the user confirms, `onConfirm` no-ops silently (no error, no busy). `run` also skips its own post-mutation `refresh()` when a concurrent refresh started mid-operation.

Action: SPLIT — separate `loadGeneration` (cancels reads) from `mutationEpoch` (bumped only on workplace change/unmount); confirmations stay valid while `epoch === mutationEpoch`; `run` always refreshes.

---

### F-06 — Five independent capture-settings owners in the UI
Priority: P2
Files:
- `src/features/settings/components/CaptureWorkspaceView.tsx` (was AutomationSettingsView at audit time)
- `src/features/settings/screens/CategorizationReviewScreen.tsx` (6)
- `src/features/settings/components/CaptureSuggestionsView.tsx` (457)
- `src/features/settings/components/HistoricalCaptureSuggestionsView.tsx` (286, 300)
- `src/features/settings/hooks/useTransactionCaptureViewModel.ts` (45–366)

Problem: Each screen instantiates its own `useTransactionCaptureViewModel`, re-fetches `getSettings` + `countCaptureReviewItems`, keeps its own `snapshot`/`error`/`loading`/`busy`, and subscribes separately. Count semantics diverge (`countCaptureReviewItems` vs. summing buckets). Partial failures are merged into a single boolean `error` with cached fallbacks.

Action: LIFT STATE — one workplace-keyed `CaptureProvider` exposes one snapshot + one `refresh`; delete per-screen refresh. Split state into `settingsState` and `listsState` (each `{data, error, loading}`).

---

### F-07 — `useTransactionCaptureViewModel` is a 368-line god hook
Priority: P2
Files: `src/features/settings/hooks/useTransactionCaptureViewModel.ts` (whole file)

Problem: fetch, merge, mutations, confirm copy, analytics, and snapshot assembly in one hook; returns a fresh object every render; `onToggleEnabled` depends on `mutations` which is a new object each render so its `useCallback` never stabilizes.

Action: SPLIT into `useCaptureSettings`, `useCaptureLists`, `useCaptureMutations`; memoize the handler group.

---

### F-08 — `useTransactionInboxViewModel` is a 300-line god hook
Priority: P2
Files: `src/features/settings/hooks/useTransactionInboxViewModel.ts` (119–265)

Problem: pagination, SMS scan prime, Gmail sync, migration repair (with confirm copy + analytics), deep-link routing, filter labels all in one hook. `handleRefresh` writes state after await with no workplace guard; deep-link dedupe guard is defeated by its own cleanup.

Action: SPLIT into `useTransactionInboxData`, `useInboxScanActions` (moved to `services/sms`), `useInboxDeepLink`. Extract a cancellable command primitive for late-result discard.

---

### F-09 — `useAccountMatcherEditorViewModel` is a 438-line god hook
Priority: P2
Files: `src/features/accounts/hooks/useAccountMatcherEditorViewModel.ts` (74–438)

Problem: load, draft, projection, validation, save, forget, paging in one hook returning ~57 fields; tests fake it with `as unknown as`. Draft state is reset by the async load callback, so keystrokes during load are clobbered. Save/forget have no reentrancy lock (only UI guards).

Action: SPLIT into `useAccountMatcherLoad`, `useAccountMatcherDraft` (keyed reducer, synchronous reset on identity change), `useAccountMatcherSave` (with `inFlight` ref guard). Extract `buildMatcherPreviewModel` into `computeCoverage`/`computeOverlaps`/`computeInspectionRange`.

---

### F-10 — Duplicated manual-review decision policy
Priority: P2
Files:
- `src/features/settings/hooks/transactionInboxImport.ts` (`prepareTransactionInboxImport`)
- `src/services/sms/pipeline/smsDecision.ts` (`decideSms`)
- `src/domain/transaction-intelligence/decideCapture.ts` / `captureDecision.ts`

Problem: `prepareTransactionInboxImport` re-derives expense/income/transfer from recognition + direction, duplicating `classifyCapture`/`decideCapture` logic. The two can diverge (e.g., direction handling for transfers).

Action: MERGE — route manual import through the same domain classification, returning suggested accounts only.

---

### F-11 — Compatibility residue (re-export shims + unreachable copy)
Priority: P3
Files:
- `src/services/sms/pipeline/smsEconomicEvidence.ts`
- `src/services/sms/pipeline/smsDecisionContext.ts`
- `src/services/accounts/accountRecognitionRefresh.ts`
- `src/constants/copy/domains/transactionCaptureStrings.ts` (unreachable `count` branch)
- `src/constants/copy/domains/gmailCaptureStrings.ts` (`sourcesUnavailable`)
- `src/features/settings/components/AccountMatcherSavedRow.tsx` (rebuilds presentation)
- `src/features/settings/index.ts` (dead `AutomationSettingsScreen` alias)

Action: DELETE the shims and unused copy; MERGE presentation helpers.

---

### F-12 — `AccountMatchersSection` owns writes and duplicates reads
Priority: P2
Files: `src/features/accounts/components/AccountMatchersSection.tsx` (2, 11, 39–44, 65–71, 141–192)

Problem: imports service internals (`observeAccountMatcherSnapshots`, `setAccountMatcherEnabled`) and invokes commands directly; toggle errors go to `toast`, editor errors go to `saveError`; two error/loading surfaces from one state pair.

Action: EXTRACT HOOK — `useAccountMatchersSection(accountId)` owning snapshots, toggle mutation, error; section becomes props-only.

---

### F-13 — Inbox card owns action policy and copy
Priority: P2
Files: `src/features/settings/components/TransactionInboxItemCardView.tsx` (86–152, ~25 hardcoded strings)

Problem: primary/`more`/`split` selection with non-null assertion at 151–152; eligibility mirrors VM logic; unhandled rejections from `run = fn => { setMenuOpen(false); void fn(item) }`.

Action: EXTRACT HOOK `useInboxItemActions(item)` returning `{primary, more, split}`; copy → `transactionCaptureStrings`; add `runAction` with catch → `showErrorAlert`.

---

### F-14 — Account matcher UI depends on hook implementations and service DTOs
Priority: P3
Files: `src/features/accounts/components/AccountMatcherEditorView.tsx`, `AccountMatcherEvidencePreview.tsx`, `AccountMatcherMatchedSmsRow.tsx`, `AccountMatcherMessageViews.tsx`, `AccountMatcherProposalRow.tsx`, `AccountMatcherSavedRow.tsx`, `src/features/accounts/hooks/details/accountDetailsViewModelTypes.ts`

Problem: view-model types are `ReturnType<typeof hook>` (ties tests to internals, forces `as unknown as`); DTOs (`AccountMatcherProposal`, `AccountMatcherPreviewMessage`, `AccountMatcherMatchedMessage`) declared in `services/` and imported by components; details type module imports from implementation hooks, inverting the types layer.

Action: RELOCATE DTOs and VM interfaces into `src/types/accountMatcher.ts` / `src/features/accounts/hooks/details/types`.

---

### F-15 — Three independent "show more" pagers + dead surface
Priority: P3
Files: `AccountMatcherEditorView.tsx`, `AccountMatcherEvidencePreview.tsx`, `AccountMatcherSavedRow.tsx`, `AccountMatchersSection.tsx`; `accountMatcherCommands.ts` (`moveAccountMatcher`, no callers); `useAccountFormViewModel.ts` (`isAccountDeleted`, unused); `useAccountMatcherManagementViewModel.ts` (`latestLinkTime`, unused; `retry` alias of `refresh`).

Action: MERGE one pager component; DELETE dead surface.

---

### F-16 — Stale identity in inbox modal (holds full item snapshot)
Priority: P3
Files: `src/features/settings/hooks/useTransactionInboxModals.ts` (35)

Problem: stores the full `TransactionInboxItem`; live list updates never refresh the open modal; only workplace swap invalidates.

Action: RELOCATE — store selected id, resolve item from `vm.items` at render.

---

### F-17 — `useObservable` resetKey identity dance (render-phase state)
Priority: P3 (pre-existing, touched in this range)
Files: `src/hooks/useObservable.ts`, `src/hooks/usePaginatedObservable.ts`

Problem: render-phase derived `visibleData` + `dataIdentity` sync is a workaround for cross-workplace leakage; `useObservableWithEnrichment` lacks resetKey support, so consumers (reports, budget detail) keep stale rows across workplace switches until the new stream emits.

Action: EXTRACT — add `resetKey` to `useObservableWithEnrichment` mirroring `useObservable`.

---

### F-18 — `observeAccountMatcherEvidenceChanges` subscribes to all accounts/journals for one account's page
Priority: P3
Files: `src/services/accounts/accountMatcherEvidenceQueries.ts` (`observeAccountMatcherEvidenceChanges`)

Problem: invalidation merges `transactionObserveQueries.observeMatcherDiscoveryChanges`, inbox discovery evidence, `accountQueries.observeAll`, and `journalObserveQueries.observeByIdsWithDeleted` for the page's journal ids. Fine-grained but couples one account's screen to every account/journal change.

Action: keep; no change needed beyond documenting. (Low priority, listed for completeness.)

**Disposition:** Accepted as-is. Broad invalidation is intentional for matcher discovery correctness; narrowing would risk stale proposals. Revisit only if account-matcher screen profiling shows material cost.

---

## Refactor Order

Phase 1 — Integrity (correctness/data safety):
- F-05 (mutation confirmation token) — prevents silent no-ops on capture enable/confirm
- F-04 (Gmail double pipeline) — removes duplicate parse/recognize/DKIM work
- F-01 (capture policy in DB) — eliminates cross-store inconsistency

Phase 2 — Structural:
- F-03 (capture allocations queryable)
- F-06 + F-07 + F-08 (UI god hooks → split + lift state)
- F-09 + F-12 (account matcher god hook + section write owner)
- F-10 (manual review decision merge)
- F-02 (write coordinator split)

Phase 3 — Cleanup:
- F-11, F-13, F-14, F-15, F-16, F-17, F-18

## Highest-Leverage Changes

1. F-05 (one counter split) — smallest change, fixes silent capture-enable failures.
2. F-04 (Gmail ingestion owns capture) — removes ~half the per-message work and the cutoff drift.
3. F-01 (capture policy in DB) — single change that deletes F-02, most of `transactionCaptureService`, and the merge remap try/catch blocks.
4. F-03 (queryable capture allocations) — removes full-table scans in three repositories and the duplicated JSON parsing.
5. F-06 (single CaptureProvider) — removes 4 redundant fetches per navigation and the divergent count semantics.

---

## Notes on methodology

- Coverage is ~84%, not 100%; 35 changed source files were not individually read (UI routes, copy strings, email DKIM crypto, `modules/expo-gmail-auth`, minor helpers). No finding depends on an unread file; all findings are grounded in read code.
- Tests were read for contracts only; test style was not audited.
- No production code was modified during this audit.
- Deleted files (23) were verified to have no dangling references via grep.
