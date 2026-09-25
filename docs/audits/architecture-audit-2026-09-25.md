# Architecture Audit — 2026-09-25

## Audit Coverage

**Repository:** full-frills-balance
**Status:** AUDIT INCOMPLETE
**Coverage:** Not certifiable; unique analyzed-path count was not reconciled
**Major flows traced:** 14
**Unresolved critical questions:** 1 — file-by-file coverage
**Audit implementation:** The audit pass changed no production code; four follow-up fixes are recorded below.
**Tests or builds:** Not run for the audit or the follow-up fixes.

The audit classified 1,960 tracked paths for scope. Completed partitions reported at least 1,290 path inspections, but the unique path union was not reconciled; this is not an analyzed-file count. It excluded 233 paths: 173 generated, historical, tooling, asset, or other non-application artifacts, and 60 behavior-only tests. Do not derive a coverage percentage from these figures.

Two partitions had no final path ledger when their workers were closed after running for more than 30 minutes without a checkpoint:

- 223 account, budget, commitment, planned-payment, and associated service paths.
- 276 persistence, reactive, import/export, currency, SMS, and native-module paths.

Some paths in those partitions had been inspected, but per-path statuses were not verified. The 118 E2E and platform-configuration paths were completed 118/118. No claim of exhaustive file coverage is justified until the missing ledgers are reconstructed and reconciled.

The dependency-cycle guard also needs qualification: an independent static graph found zero runtime import SCCs, but the guard conflates type-only and runtime edges and may miss a runtime cycle inside an existing type SCC.

## Architecture Map

1. **Application entry and setup:** Expo Router enters through LaunchCoordinator/workplace selection and setup journeys.
2. **Persistence:** WatermelonDB repositories and AccountingWriteSession own database access and accounting writes. MMKV-backed User, Device, and Workplace preference stores persist preferences.
3. **Read/reactive path:** RxJS cached streams feed hooks and view models, which supply screen and component state.
4. **Accounting and currency:** Native journal amounts are stored per line, with a line-to-journal exchange rate; accounting reads and report conversions rebuild values across currencies.
5. **Adjacent runtime systems:** SMS ingestion and rule evaluation, native widgets, notifications, and import/export/restore each cross UI, service, persistence, or platform boundaries.

This describes the observed architecture from the audit snapshot. The incomplete coverage means it is not a verified inventory of every module or dependency.

## Primary Entropy Sources

1. **Currency semantics are distributed.** Different read paths interpret line rates, reporting currencies, and native balances differently.
2. **Lifecycle ownership is fragmented.** Workplace changes, cache disposal, async work, and native widget state do not share a single lifecycle owner.
3. **Persisted contracts conflict.** Backup formats, SMS rules, preferences, recurrence values, and currency rows have multiple interpretations.
4. **Layer boundaries leak.** UI hooks and components own orchestration or reporting behavior that belongs in domain or lifecycle services.

## Findings

Each item records one primary refactoring action. Paths and behavior below reflect the audit snapshot; verify the current code before implementing, especially because coverage was incomplete.

### F-01 — P0: Reporting FX uses the wrong rate contract

**Files:** src/services/reports/reportingDeltaEngine.ts:15; src/services/reports-v2/reader/ledgerFactReader.ts:148; src/services/currencyConversion.ts:67; src/services/budget/budgetCalculationHelpers.ts:52; docs/adr/0007-journal-currency-and-balancing-decision-layer.md:53.

**Problem & entropy risk:** A stored line rate converts line currency to the saved journal currency, but reporting paths can pass it as though it converts directly to the target currency. The v1 report path omits the historical event date, and a generic historical helper can fall back to spot rates. Each new report path can silently invent its own FX interpretation.

**Action:** RELOCATE.

**Proposed architecture:** A journal-aware conversion boundary accepts line currency, journal currency, stored line rate, journal date, and target currency. It applies the stored line-to-journal rate, then converts journal-to-target at the journal date. Historical callers must provide the event date.

**Before → after:** Report passes stored line rate directly to target → report requests an explicit two-leg, date-aware journal conversion.

### F-02 — P0: Safe-to-Spend adds balances in unlike currencies

**Files:** src/services/simulation/safeToSpendInputAcquisition.ts:196; src/services/balance/balanceReadService.ts:143; src/services/simulation/safeToSpendProjection.ts:39; src/services/simulation/CashFlowSimulationService.ts:284.

**Problem & entropy risk:** Acquisition sums native-currency balances and labels the total with the default currency, while simulation converts balances individually. The same dashboard can therefore mix unlike units before projection, and downstream code cannot recover the original currencies.

**Action:** RELOCATE.

**Proposed architecture:** Normalize each balance at a shared acquisition boundary and pass a currency-consistent amount/map to the simulator.

**Before → after:** Sum native amounts, then label as default currency → convert each balance, then aggregate in a declared currency.

### F-03 — P0: Duplicate SMS messages can both post in one batch

**Files:** src/services/sms/pipeline/smsSyncPipeline.ts:178; src/services/sms/pipeline/smsInboxRecordPreparer.ts:85; src/services/sms/pipeline/smsFingerprint.ts:9.

**Problem & entropy risk:** Duplicate checks use sets that are not updated as staged items are processed. Two identical fingerprints in one incoming batch can both pass the snapshot check and auto-post.

**Action:** RELOCATE.

**Proposed architecture:** Reserve each fingerprint in the writer’s item loop as soon as an item is accepted, so subsequent items in the same batch see it.

**Before → after:** Every staged item checks the same pre-write snapshot → each accepted item updates the batch-visible fingerprint set.

### F-04 — P0: Account-reference checks race with writes

**Files:** src/services/accounts/accountReferenceGraph.ts; src/services/accounts/accountDeleteCommands.ts:21; src/services/budget/budgetWriteService.ts:11; src/services/planned-payment/plannedPaymentCommands.ts.

**Problem & entropy risk:** Reference eligibility and blocker checks happen outside the transaction that changes references or deletes/merges an account. A concurrent write can invalidate the check and leave dangling references.

**Action:** RELOCATE.

**Proposed architecture:** The reference owner validates blockers and performs the related write in one transaction/write session.

**Before → after:** Check references, then write later → validate and mutate together under the owning transaction.

### F-05 — P0: Native widget data survives workplace deletion or reset

**Files:** src/features/app/hooks/useWidgetSync.ts:131; src/services/WorkplaceService.ts:121; src/services/integrity/integrityMaintenance.ts:44; modules/expo-widgets/ios/ExpoWidgetsModule.swift:5; Android widget bridge (exact path was not retained in the audit notes).

**Problem & entropy risk:** The UI hook syncs widget state, but native storage outlives the mounted UI. Deleting or resetting a workplace can leave an old financial snapshot available to the widget.

**Action:** RELOCATE.

**Proposed architecture:** The workplace destructive lifecycle owns clearing or replacing native widget state as part of delete/reset completion.

**Before → after:** A mounted hook is the only sync owner → workplace delete/reset explicitly clears or replaces the native snapshot.

### F-06 — P0: Safe-to-Spend failure is rendered as zero and stops observing

**Files:** src/services/simulation/SafeToSpendReadModel.ts:95.

**Problem & entropy risk:** The catch path emits an empty dashboard and completes the inner source. A failure looks like a valid zero balance, and later source updates cannot recover the stream.

**Action:** RELOCATE.

**Proposed architecture:** The cached workplace read-model boundary owns an explicit recoverable error/retry state and keeps the observation lifecycle alive.

**Before → after:** Error becomes zero, then stream completes → error is represented as recoverable state and future updates/retries can repopulate the model.

### F-07 — P1: Backup export and restore disagree on the archive contract

**Files:** src/services/export/nativeBackupExporter.ts:208; src/services/import/plugins/native-plugin.ts:89; src/services/import/index.ts:12.

**Problem & entropy risk:** Export writes a v2 full-frills-backup document containing workplaces[], while import expects a legacy root with arrays and a string version. No v2 decoder bridges these contracts, so the app’s own export is not guaranteed to restore.

**Action:** SPLIT.

**Proposed architecture:** Add a versioned archive-decoder boundary. Each version-specific decoder maps its input to one canonical restore model; restore operates only on that model.

**Before → after:** Export and restore assume incompatible root shapes → version decoder → canonical restore model → restore.

### F-08 — P1: Web ZIP sharing writes base64 text as file bytes

**Files:** src/services/SharingService.ts:127, :322; src/services/export/currentWorkplaceBackupExporter.ts:28.

**Problem & entropy risk:** Native sharing writes base64 content, while the web path constructs a Blob from the base64 string without decoding it. The resulting ZIP contains encoded text rather than the archive bytes.

**Action:** SPLIT.

**Proposed architecture:** Keep explicit platform-specific text and binary paths. The web path decodes base64 to bytes before creating the ZIP Blob.

**Before → after:** Shared string is treated as bytes on web → web decodes archive bytes; native keeps its supported encoding path.

### F-09 — P1: Cache eviction completes active consumers

**Files:** src/services/reactive/ReactiveCacheCoordinator.ts:83; src/services/reactive/disposableReplay.ts:28; src/hooks/useObservable.ts:107.

**Problem & entropy risk:** Disposing a replay cache completes its subscribers, but hooks do not rebind on completion. Teardown can also throw after a database commit, making the caller report failure even though the mutation committed.

**Action:** RELOCATE.

**Proposed architecture:** The cache owner rotates cache generations and isolates teardown failures from already-committed writes. Consumers bind to the current generation rather than treating eviction as terminal.

**Before → after:** Eviction disposes the stream underneath consumers → cache owner replaces a generation and maintains consumer continuity.

### F-10 — P1: A planned-payment trigger can miss newly due work

**Files:** src/services/planned-payment/plannedPaymentOrchestration.ts:105.

**Problem & entropy risk:** A second trigger joins an in-flight promise. If the first run already snapshotted active payments, a newly due payment is omitted until another trigger occurs.

**Action:** RELOCATE.

**Proposed architecture:** A workplace-owned drain tracks a dirty/queued signal while a run is in progress and repeats until no newly due work remains.

**Before → after:** Concurrent trigger is discarded into the current promise → concurrent trigger marks another drain pass.

### F-11 — P1: Bootstrap drops the saved reminder weekday

**Files:** src/features/app/hooks/useAppBootstrap.ts:84; src/services/notification/NotificationService.ts:65.

**Problem & entropy risk:** Bootstrap omits the persisted weekday; the service defaults to Monday. Startup can silently schedule a different day than the user selected.

**Action:** MERGE.

**Proposed architecture:** One reminder-schedule reconciler reads and applies the complete persisted schedule, including weekday, at bootstrap and on changes.

**Before → after:** Bootstrap calls scheduling with partial settings → all callers use the complete schedule reconciler.

### F-12 — P1: Journal editor FX requests can commit stale results

**Files:** src/features/journal/entry/hooks/useJournalEditorExchangeRates.ts:36, :98.

**Problem & entropy risk:** The cache key omits valuation currency. Async work commits by line ID without checking the request context or generation, so an older response can update a newer editor state.

**Action:** EXTRACT HOOK.

**Proposed architecture:** A request-owning hook keys and guards results by journal, line, line currency, valuation currency, and date; commit is allowed only for the active generation.

**Before → after:** Line ID is enough to accept an async result → context-complete key and generation check gate the commit.

### F-13 — P1: SMS rule fields have conflicting canonical sources

**Files:** src/services/sms/smsRuleFormPolicy.ts:66; src/services/sms/SmsRuleEngine.ts:83; src/features/settings/components/SmsRuleCardView.tsx:26.

**Problem & entropy risk:** The form prefers account IDs in JSON, the engine treats columns as canonical, and the card combines JSON disposition with column values. A rule can display differently from how it executes.

**Action:** RELOCATE.

**Proposed architecture:** A single rule projection owns canonicalization and exposes the same normalized rule to editing, display, and execution.

**Before → after:** Three consumers choose different fields → consumers read one canonical rule projection.

### F-14 — P1: Voice capture and parse results outlive the visible session

**Files:** src/features/journal/entry/hooks/useVoiceJournalParse.ts:62, :99, :137; VoiceInputModal.tsx; SimpleModePanel.tsx.

**Problem & entropy risk:** Closing the modal does not cancel native capture or invalidate an in-flight parse. A late response can populate the next visible session with stale content.

**Action:** EXTRACT HOOK.

**Proposed architecture:** A visible-session hook owns capture and parse generations, cancellation, and guarded state updates. Closing a session invalidates its pending work.

**Before → after:** Modal visibility changes while async work remains valid → session generation and cancellation control every result.

### F-15 — P1: Android release configuration permits cleartext traffic

**Files:** android/app/src/main/AndroidManifest.xml:28; android/app/src/main/res/xml/network_security_config.xml:3.

**Problem & entropy risk:** The base network security configuration allows cleartext in all variants, including release.

**Action:** SPLIT.

**Proposed architecture:** Put the cleartext exception in debug-only configuration; release configuration enforces TLS.

**Before → after:** Main manifest applies cleartext allowance to every build → debug gets the exception, release gets a restrictive policy.

### F-16 — P2: Setup journey identifiers collide

**Files:** src/features/setup/setupRuntime.ts:164; src/features/setup/setupRecipes.ts:63; src/features/setup/setupRouting.ts:9; src/features/app/OnboardingRoute.tsx:6.

**Problem & entropy risk:** Generic setup and Cash Clarity share first_run. A restore-discard relaunch can resolve to the wrong journey because distinct flows are represented by the same identifier.

**Action:** SPLIT.

**Proposed architecture:** Give each setup journey a distinct stable ID and route explicitly from that ID.

**Before → after:** Multiple journeys share first_run → each journey has its own routeable identifier.

### F-17 — P2: Journal timeline account enrichment is not reactive

**Files:** src/services/journal/journalTimelineReadModel.ts:93; src/data/repositories/journal/JournalObserveQueries.ts:33; src/data/repositories/journal/JournalEnrichmentQueries.ts:296.

**Problem & entropy risk:** The timeline observes journal changes, but raw account enrichment runs only when the journal source emits. Account membership changes alone can leave the timeline stale.

**Action:** SPLIT.

**Proposed architecture:** Move account membership into a reactive account-enrichment projection observed alongside journal data.

**Before → after:** Journal emission triggers a one-off account query → timeline combines reactive journal and account-enrichment sources.

### F-18 — P2: Account edit can partially commit

**Files:** src/features/accounts/hooks/useAccountPersistence.ts:70; src/services/accounts/accountHierarchyCommands.ts; src/services/accounts/accountAdjustCommands.ts.

**Problem & entropy risk:** Account details persist before a separate balance-adjustment write. If adjustment fails, the account is partially updated while the UI can report the whole operation as failed.

**Action:** RELOCATE.

**Proposed architecture:** One composite account command owns detail and balance changes in a single write session, with one outcome for the UI.

**Before → after:** Details commit, then adjustment commits separately → one command and transaction produce one atomic result.

### F-19 — P2: Preference stores publish at different commit points

**Files:** src/services/preferences/PreferencesStore.ts:43, :186; Device and Workplace preference store files (exact paths were not retained in the audit notes).

**Problem & entropy risk:** The User store publishes before saving and catches persistence failure; other stores persist first and then publish or throw. Callers cannot rely on a consistent meaning of success or observed state.

**Action:** MERGE.

**Proposed architecture:** Define one persistence commit contract for preference stores and apply it consistently before publishing state.

**Before → after:** Store-specific publish/save/error ordering → a shared commit contract across preference owners.

### F-20 — P2: iOS widget App Group ID differs by build variant

**Files:** plugins/withJournalLauncherWidget.js:116; modules/expo-widgets/ios/ExpoWidgetsModule.swift:5; app.config.ts:25; app-variants.json.

**Problem & entropy risk:** The config plugin derives an App Group ID from the bundle ID, while the native bridge hardcodes the production ID. Non-production variants can write and read different shared containers.

**Action:** INVERT DEPENDENCY.

**Proposed architecture:** Generate the App Group ID once from variant configuration and inject that value into both plugin output and native bridge configuration.

**Before → after:** Plugin and bridge independently choose IDs → both consume one generated variant value.

### F-21 — P2: SQL and ORM fallback group recurring transactions differently

**Files:** src/data/repositories/raw/TransactionRawPatternQueries.ts:17.

**Problem & entropy risk:** SQL grouping includes description; the ORM fallback does not. Results change with the query path, so grouping semantics are duplicated in implementation details.

**Action:** MERGE.

**Proposed architecture:** Put the grouping rule in one shared query/model contract used by SQL and fallback paths.

**Before → after:** SQL and ORM encode separate grouping rules → both implement one declared grouping contract.

### F-22 — P2: Ivy import can persist an unsupported recurrence value

**Files:** src/services/import/plugins/ivy-plugin.ts:209, :246; src/services/import/plugins/importPluginHelpers.ts:94.

**Problem & entropy risk:** The importer stores normalized DAILY but recurrence advancement combines the original DAY with LY, producing DAYLY, which is unsupported.

**Action:** MERGE.

**Proposed architecture:** Normalize the recurrence interval once and pass that canonical value to persistence and advancement.

**Before → after:** Persistence and advancement derive values separately → both consume one normalized interval.

### F-23 — P2: Currency initialization can choose a deleted duplicate

**Files:** src/services/currency-init-service.ts:30; src/data/repositories/CurrencyRepository.ts:63; src/data/database/schema.ts:57.

**Problem & entropy risk:** There is no uniqueness constraint, and an unordered query takes the first row. Duplicate currencies can resolve nondeterministically, including selecting a deleted row or reviving one unexpectedly.

**Action:** MERGE.

**Proposed architecture:** Resolve duplicates deterministically with active rows preferred, and enforce uniqueness at the persistence boundary where supported.

**Before → after:** First unordered match wins → deterministic active-first resolution under a unique currency identity.

### F-24 — P2: Dependency-cycle guard blurs runtime and type-only edges

**Files:** scripts/check-dependency-cycles.mjs:38.

**Problem & entropy risk:** The guard treats type and runtime edges together. It may miss a new runtime cycle hidden inside a baseline type SCC. An independent graph found zero runtime SCCs, so this is a guard weakness rather than a confirmed runtime cycle.

**Action:** SPLIT.

**Proposed architecture:** Build and check separate runtime and type-only dependency graphs, with an explicit baseline policy for each.

**Before → after:** One conflated graph obscures edge meaning → separate checks report runtime cycles independently from type relationships.

### F-25 — P2: Report chart tooltips are assigned to the wrong chart

**Files:** src/features/reports/components/sections/ReportWealthSection.tsx:83.

**Problem & entropy risk:** The area chart receives the bar tooltip callback and the bar chart receives the area callback. Keeping cross-chart callbacks detached from their data makes a local wiring error easy to introduce.

**Action:** RELOCATE.

**Proposed architecture:** Define each tooltip callback next to the chart data and component that consume it.

**Before → after:** Callbacks are cross-wired between chart branches → each chart owns its matching callback beside its data.

### F-26 — P2: Bootstrap mutates the audit registry during render

**Files:** src/features/app/hooks/useAppBootstrap.ts:35; src/features/app/bootstrap.ts:7; src/services/audit-handlers.ts:16.

**Problem & entropy risk:** A render-time hook registers app audit handlers into a registry. Rendering now has a global mutation side effect, making repeated render and lifecycle behavior harder to reason about.

**Action:** RELOCATE.

**Proposed architecture:** Register handlers in an explicit bootstrap/service initialization boundary outside render.

**Before → after:** Hook render mutates global registry → application initialization owns one-time registration.

### F-27 — P2: Domain icon catalog depends on the renderer

**Files:** src/types/domainIcons.ts:101.

**Problem & entropy risk:** A domain icon-name catalog depends on React Native renderer details. Domain consumers inherit a presentation dependency and cannot use the catalog independently.

**Action:** SPLIT.

**Proposed architecture:** Keep a pure icon-name catalog/parser in the domain-facing module and map names to renderer components in the UI layer.

**Before → after:** Domain names and React Native rendering share a module → pure names flow one-way into a renderer mapping.

### F-28 — P2: Date utilities read global preference state

**Files:** src/utils/dateUtils.ts:95.

**Problem & entropy risk:** A date utility reads the global hour-cycle preference, hiding an environmental dependency in a supposedly reusable transformation.

**Action:** INVERT DEPENDENCY.

**Proposed architecture:** Callers provide hourCycle explicitly; the utility stays deterministic and independent of preference storage.

**Before → after:** Utility reads global preferences → caller supplies hourCycle as an input.

### F-29 — P2: Core ErrorBoundary owns app-specific reporting

**Files:** src/components/core/ErrorBoundary.tsx:11.

**Problem & entropy risk:** A core UI boundary directly owns application reporting behavior. The generic boundary is coupled to app policy, making reuse and error handling harder to separate.

**Action:** RELOCATE.

**Proposed architecture:** Move app reporting to an application-level reporting adapter around or configured by the core boundary.

**Before → after:** Core boundary reports through app-specific behavior → core catches errors; application adapter decides reporting policy.

## Remediation Progress

Implemented in source; verification pending:

- **F-08:** Decode ZIP base64 to bytes before creating web download blobs.
- **F-11:** Pass the persisted reminder weekday during bootstrap scheduling.
- **F-22:** Advance Ivy recurrences using the normalized interval value.
- **F-25:** Match each report chart with its own tooltip callback.

The audit remains **INCOMPLETE** because repository coverage and depth checks are unresolved. These code changes have not been tested or built.

## Refactor Order

### Phase 1: Integrity

Remaining: F-01 through F-07, F-09, F-10, F-14, F-15, and F-23. F-08 and F-11 are implemented, pending verification. These findings address incorrect financial values, duplicate posting, reference races, stale widget state, lost reactive recovery, incompatible backup behavior, and release configuration. F-09 and F-10 also require the structural ownership work listed in Phase 2.

### Phase 2: Structural

Complete F-09 and F-10’s ownership changes, then F-12, F-13, and F-16 through F-20, plus F-26. These consolidate request/session ownership, canonical rule and setup identities, atomic account writes, preference commit semantics, variant configuration, and bootstrap side effects.

### Phase 3: Cleanup

Remaining: F-21, F-24, and F-27 through F-29. F-22 and F-25 are implemented, pending verification. These findings align fallback semantics, recurrence normalization, architecture tooling, chart wiring, renderer boundaries, utility dependencies, and error reporting.

## Highest-Leverage Changes

1. Establish one journal-aware, event-date-required currency conversion boundary.
2. Make workplace mutation ownership cover the transaction and its post-commit cache/widget lifecycle.
3. Introduce versioned backup decoding into one canonical restore model.

## Working Notes

- Treat this file as the audit snapshot, not proof that the repository is fully covered.
- Before closing the audit, reconstruct the two missing path ledgers, reconcile unique analyzed/excluded/blocked paths against the inventory, revisit the cycle guard, and complete the adversarial/depth checks required by the audit skill.
- Before implementing remaining findings, confirm current behavior and exact paths; some Android bridge and preference-store paths were not preserved in the audit notes.
- Verify the F-08, F-11, F-22, and F-25 changes before treating them as closed.
- Track remediation progress here or in linked issues, but keep audit status INCOMPLETE until coverage and depth are verified.
