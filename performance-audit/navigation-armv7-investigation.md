# Navigation and ARMv7 investigation — 2026-10-21

## Scope and evidence limits

- Source baseline: `11ebb8d3d5341c881c824359bd884f256aa3a905`.
- User observation: ordinary navigation/tab switches are nearly unusable on a reportedly ARMv7 installation and substantially better on a different ARM64 installation. User identifies the comparison phones as Nothing Phone (1) and Samsung A17; explicit model-to-symptom mapping, Android versions, RAM, installed build modes/process ABIs, dataset parity, and timings remain unconfirmed. Model names alone do not establish process ABI.
- Scope: static investigation of the fourteen navigation hypotheses from this conversation, plus build-mode and ABI controls. This is not a new exhaustive whole-repository audit.
- Six parallel specialists cover navigation/provider lifecycle, destination computation/data, reactive lifetime, native/ABI/build paths, rendering/memory, and background/telemetry.
- Investigation only: no application edits, tests, builds, benchmarks, device operations, or external service actions were performed by the parent investigator or six specialists. The only new repository artifact is this report.
- Pre-existing dirty files: `android/app/src/main/AndroidManifest.xml`, `ios/FullFrillsBalance.xcodeproj/project.pbxproj`, and `ios/FullFrillsBalance.xcodeproj/xcshareddata/xcschemes/FullFrillsBalance.xcscheme`; preserve them.
- E1 means a plausible static signal. E2 means a reachable execution/scaling path is established; neither proves observed latency. No E3/E4 device evidence is available in this investigation.
- August audit/profile metadata is historical context, not current runtime evidence. The reusable skill's profile was found at its skill root rather than its referenced `references/` location.

## Investigation coverage ledger

| ID | Hypothesis | Owner | Disposition |
|---|---|---|---|
| H1 | JS screen-entry computation blocks navigation | Destination computation | E2 Accounts/report/Forecast transforms and synchronous database path; repeated warm-switch cost unmeasured |
| H2 | Broad React/provider invalidation | Navigation lifecycle | E2 pathname reaches provider owner; E1 changing identities, compiler behavior unknown |
| H3 | Hidden screens remain active | Reactive lifetime | E2 retained trees and upstream sources; work requires emissions/initialization |
| H4 | Screen remount and subscription churn | Navigation lifecycle | Weakened for repeated bottom-tab remount; inner-tab subtree replacement established |
| H5 | Reactive update amplification | Reactive lifetime | E2 duplicate insight, budget-usage, and journal-enrichment graphs; not inherently triggered on every warm switch |
| H6 | Excess data loading or repeated summaries | Destination computation | E2 full report input loading, account reconstruction, forecast inputs, and growing pagination prefixes; initial journals limited to 15 |
| H7 | Synchronous storage/native calls | Native/ABI | E2 synchronous JSI SQL/materialization, JSON parsing/stringification, and MMKV paths |
| H8 | Layout/SVG/transition pressure | Rendering/memory | E2 journal-row measurement/chart work; universal bottom-tab animation explanation weakened |
| H9 | Memory pressure and allocations | Rendering/memory | E2 retained paginated datasets/cache owners; GC pressure or leak unmeasured |
| H10 | ARMv7-specific runtime/native behavior | Native/ABI | Conditional JSI fallback established; ARMv7 selecting it unproven; other ABI branches off traced navigation path |
| H11 | First-visit initialization | Navigation lifecycle | E2 lazy first mounts and delayed startup work; weakened for settled repeated visits |
| H12 | Telemetry/logging on navigation | Background/telemetry | E2 Sentry full-rate navigation tracing, PostHog route events, production trace logging; replay explanation weakened |
| H13 | Resume/background workload collision | Background/telemetry | E2 route-triggered notification queue, delayed bootstrap and resume maintenance; startup/resume alone cannot explain settled navigation |
| H14 | Thermal/power constraints | Background/telemetry | Runtime evidence required; source cannot establish device throttling |
| C1 | Development versus release parity | Native/ABI | Local default is development; actual installed builds unconfirmed |
| C2 | Installed ABI and preview coverage | Native/ABI | Preview ARM64-only, production dual ABI; older dual-ABI AAB inspected, installed artifacts unconfirmed |

## Measurement tooling gaps established by source

- `src/utils/TraceService.ts:15` uses wall-clock `Date.now()`; trace metrics describe elapsed time since trace creation, not individual phase durations or input-to-presentation latency (`:31-37`).
- `src/utils/logger.ts:142-155` forwards only metrics meeting the configured slow threshold to its performance reporter. `src/constants/app-config.ts:93` sets that threshold to 200 ms; absence of an event cannot establish a smooth frame or responsive interaction.
- `e2e/specs/smoke/appLaunchPerformance.e2e.ts` is iOS-specific (`:4,18`), requires a backup/simulator setup (`:15-16`), and does not validate ARMv7 navigation.
- Its samples labelled resume call `reloadReactNative()` (`:53-58`), not Android background/foreground resume.
- Its activity wait checks the tab button's visibility (`:63-66`), not readiness of destination content. Dashboard completion delegates to `e2e/actions/launch.ts:90-105`, which accepts screen visibility or screen existence plus tab visibility. That does not establish completed data convergence or successful interaction.
- No existing suite was run. These are source-level limitations of what its results would establish, not a claim that its implementation caused the reported slowdown.

## Historical profile drift

| Surface | August audit/profile | Current source/configuration |
|---|---|---|
| Baseline | `6fb79796`, 2026-08-25 | `11ebb8d3`, 2026-10-21 investigation |
| Expo | `~57.0.8` | `~57.0.25` declared; current lock entry resolves 57.0.25 |
| React Native | `0.86.0` | `0.86.3` |
| FlashList | `2.0.2` | `2.3.2` |
| Hermes/New Architecture | Expected, no runtime proof | Enabled by native configuration; installed runtime still unverified |
| React Compiler | Enabled | Enabled in Expo/Babel; actual transformed output not inspected |
| Other historical feature claims | Includes AI/model workflows | Not used as evidence for ordinary tab navigation; current path reachability required |

Version declarations and lock entries are reproducibility context, not proof of what either phone has installed or of a performance regression.

## Specialist results and consolidated priorities

Investigation priorities below rank relevance and discriminating value, not measured impact or performance-bug severity. No runtime root cause is confirmed.

### N1 — every route change queues SMS notification maintenance

**Evidence: E2 established work; navigation latency unknown. Covers H13 and a common trigger relevant to H1/H5/H7.**

`src/features/app/hooks/useSmsNotificationLifecycle.ts:47-57` depends on pathname and calls `smsReviewNotificationService.refresh()`. `src/services/sms/SmsReviewNotificationService.ts:60-63` appends a delivery pass to a promise queue; route calls have no latest-request coalescing. Its foreground observable merges inbox/consumption/preferences with `auditTime(0)`, but that does not coalesce direct pathname calls (`:35-47`).

Each accepted pass loads preferences, reconciles notifications, and fetches pending inbox records (`:87-136`). `src/services/notification/NotificationService.ts:157-179` enumerates presented and scheduled native notifications, then inspects SMS requests. `src/data/repositories/DeviceSmsInboxRepository.ts:243` fetches pending device records without a shown limit. Actionable/grouped notifications and pending records can add per-record lookups; delivery/suppression can write receipts. Disabling review delivery does not skip this initial reconciliation and pending query.

This work is scheduled by an effect and is not awaited by the tab press handler. Therefore it establishes route-induced competing work, not a synchronous gate on navigation. No backlog or execution time has been measured. Empty queues and no SMS notifications reduce the work; native enumeration and the pending query still have a reachable route trigger.

**Next discriminator:** count queued/started/finished passes and native/query durations during settled tab changes with empty versus synthetic populated SMS/notification state. Temporarily preserve privacy/suppression behavior while coalescing equivalent maintenance requests. Candidate intervention: a latest-state dirty flag/coalesced drain, with reconciliation triggered only when relevant visibility or inbox state changes. Preserve lock/privacy cleanup, notification delivery retries, and correct foreground suppression.

### N2 — SQL can occupy the JavaScript calling thread despite async wrappers

**Evidence: E2; covers H1/H6/H7.**

The account list joins a shared balances stream (`src/features/accounts/hooks/useAccountsListViewModel.ts:102`, `src/services/reactive/reactiveAggregatedBalances.ts:103`). `src/data/database/DatabaseUtils.ts:34-35` exposes an `async` function but immediately invokes the JSI `unsafeQueryRaw` host function. Installed `node_modules/@nozbe/watermelondb/native/shared/Database-query.cpp:126-142` executes SQLite and materializes the returned rows under a mutex before returning to JavaScript.

`src/data/repositories/account/AccountListMetricsQueries.ts:35-94` computes latest balances with a window over eligible transaction history and returns workplace accounts. Returned account count and history scanned are separate scaling axes; the query plan and actual scan count are unmeasured. A warm switch may replay existing results rather than execute SQL again, so query frequency must be established before attributing repeated tab latency.

**Next discriminator:** record query start/finish, rows, plan, and coincident JS/native frames on first Accounts entry, warm entries, and relevant emissions. Candidate intervention: reduce the measured query's scanned/materialized work or move suitable work off the interaction-critical thread, preserving financial results and atomicity. Do not replace SQL based on source complexity alone.

### N3 — a conditional database fallback can change the amount of work dramatically

**Evidence: E2 conditional implementation; actual selection E0/unconfirmed. Covers H10.**

Native configuration requests JSI unconditionally (`src/data/database/adapter.native.ts:16-25`). Installed `node_modules/@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.native.js:108-134` falls back to the asynchronous dispatcher when JSI cannot initialize. This removes the private `_dispatcher._db.unsafeQueryRaw` seam used by `DatabaseUtils.ts:25-51`. Account metrics then take the fallback at `AccountListMetricsQueries.ts:114-123`; `:145-225` fetches accounts and eligible transaction models and groups/reduces them in JavaScript.

No inspected application condition selects this based on ARMv7, and the presence of native libraries does not establish successful initialization. The alternative may differ due to linkage/build/runtime state independently of CPU architecture.

**Next discriminator:** inspect the selected dispatcher/raw-query capability and fallback warning on each installation. If both use JSI, downgrade this explanation. If only the slow installation falls back, investigate initialization/linkage before optimizing React. Do not disable correctness fallbacks merely to remove their cost.

### N4 — retained tabs and hot caches keep independent data graphs alive

**Evidence: E2; covers H3/H5/H9.**

Installed bottom tabs lazily mount and retain visited screen keys (`node_modules/expo-router/build/react-navigation/bottom-tabs/views/BottomTabView.js:82,175,202`). Inactive native screen detachment does not tear down React hooks. `src/hooks/useObservable.ts:117-148` cleans up on dependencies/unmount, not blur. `src/services/reactive/disposableReplay.ts:18-35` retains its upstream subscription until explicit disposal, even after its last downstream subscriber leaves. Workplace switching evicts caches (`src/features/app/LaunchCoordinator.tsx:361`). This ownership is explicit and is not alone a leak.

Concrete duplicated/retained work:

- Commitments constructs both budget and planned-payment view models before selecting the visible list (`src/features/commitments/screens/CommitmentsScreen.tsx:17-65`).
- Safe-to-Spend and Commitments independently subscribe to per-budget usage (`src/services/simulation/safeToSpendInputAcquisition.ts:224`, `src/features/budget/hooks/useBudgetListViewModel.ts:26`, `src/services/budget/budgetReadService.ts:255`).
- Dashboard requests active insights while Hub also requests dismissed insights. Separate cache keys each compute insights before filtering (`src/features/hub/hooks/useHubViewModel.ts:45`, `src/services/insight/InsightService.ts:61`).
- Bootstrap retains a dashboard journal-enrichment stream while the visible Dashboard has another timeline stream (`src/features/app/hooks/useAppBootstrap.ts:100`, `src/services/ReactiveDataService.ts:155`, `src/features/dashboard/hooks/useDashboardViewModel.ts:151`, `src/services/journal/journalTimelineReadModel.ts:35`).
- Account-detail cached graphs grow by distinct account/currency/workplace keys and have no per-account size/age cap shown (`src/services/ReactiveDataService.ts:238`).

Bounds/counterevidence: five bottom-tab roots, not another root on every switch; shared workplace/account/journal streams and shared aggregate balance SQL already avoid some duplication. Retention only turns into computation when initial sources, database changes, hourly insight refresh, foreground/date refresh, or other inputs emit. Warm idle switches do not inherently cause all graphs to recompute. `switchMap` can discard obsolete Promise results without cancelling work already started.

**Next discriminator:** count calculation starts/subscribers before and after visiting Commitments/Hub/account details, then make one controlled synthetic mutation. Candidate interventions: share insight work before dismissal filtering, share budget usage by its true input key, reuse timeline enrichment, and explicitly lease/evict measured costly hidden graphs. Freezing a React tree alone does not stop cached upstream work. Preserve fresh balances and date/foreground updates.

### N5 — snapshot persistence still performs synchronous serialization and storage

**Evidence: E2; covers H7/H9.**

`src/utils/SnapshotService.ts:173-185` synchronously reads MMKV and parses JSON during snapshot loads, which can seed initial hook state (`src/hooks/useObservable.ts:85`). Writes serialize payloads for comparison; changed values serialize the snapshot envelope again and call MMKV synchronously (`SnapshotService.ts:104-126`). Deferred dashboard/account writes coalesce by key via a zero-delay timer (`:134-152`); the timer changes scheduling, not execution thread. Safe-to-Spend still saves a snapshot inline before emitting its ready result (`src/services/simulation/SafeToSpendReadModel.ts:179`, `safeToSpendSnapshotWriter.ts:71`).

Snapshots exclude some full simulation internals, and clear/eviction paths cancel pending work. Repeated unchanged payloads avoid the storage write but still perform the comparison serialization. Snapshot persistence is MMKV work, not a ledger write, so it does not by itself form a Watermelon invalidation loop.

**Next discriminator:** split read/parse, comparison stringify, envelope stringify, and native storage timing; record bytes without values. Candidate intervention: coalesce measured inline persistence or reduce payload to consumer needs, retaining cache freshness and workplace isolation.

### N6 — journal rows have a measurable layout mechanism to investigate

**Evidence: E2 row/geometry paths, E1 visual cost; covers H8.**

Dashboard/Activity reach `src/components/journal/JournalEntryListView.tsx:71` → `JournalEntryCard.tsx:134` → `JournalAccountFlow.tsx:225`. Footers measure available/source/destination widths, update state, and choose inline versus stacked layout. A changed measurement/content key recreates an inner subtree (`:284`); account legs add SVG icons/conditional gradients (`:60`). Work scales with rendered/recycled rows and account legs. Equality checks bound repeated layout updates; no endless loop or every-revisit remeasurement is proven.

Dashboard line-chart geometry sorts points and generates paths (`src/features/dashboard/components/SafeToSpendChart.tsx:48`, `src/components/charts/LineChart.tsx:82`, `src/components/charts/line/chartMath.ts:75`). It does not mount one SVG point indicator per datum; only selected-point indicators render. Bottom-tab animation defaults to none in the inspected installed navigator. Internal `AppTabs` JS springs are separate from bottom navigation (`src/components/core/AppTabs.tsx:56`). No blur implementation was found; generic blur/continuous-animation claims are weakened.

**Next discriminator:** separately simplify journal footers and hide dashboard chart while preserving data/navigation on the affected device. Candidate intervention: simplify the demonstrated row measurement cycle or stabilize actual chart inputs only if the controlled comparison identifies material cost.

### N7 — pathname-driven provider invalidation is plausible but compiler-dependent

**Evidence: E2 route-to-owner path, E1 runtime identity signal. Covers H2.**

`src/features/app/LaunchCoordinator.tsx:284` reads pathname in the component owning Workplace. It constructs callbacks (`:462,492`) and supplies them to `WorkplaceProvider` (`:501-507`). `src/contexts/WorkplaceContext.tsx:48-55,72-79` wraps these callbacks and constructs the context value. If identities change at runtime, visited Workplace consumers can be invalidated by navigation.

React Compiler is configured (`babel.config.js:10`), and transformed output/runtime identities were not inspected. Source object/function allocation alone cannot establish actual identity changes, consumer commits, or cost. Several other shell providers already memoize values, and theme colors are stable registry references; a universal provider-churn claim is unwarranted.

**Next discriminator:** record context/callback identity and inactive-screen commit participation on settled warm switches. Candidate intervention: isolate pathname guarding from provider ownership or stabilize the demonstrated identities. No blanket memoization recommendation.

### N8 — navigation tracing and production log work are enabled

**Evidence: E2 configuration and reachable instrumentation; runtime overhead unknown. Covers H12.**

`src/services/analytics/analyticsService.ts:121` configures Sentry with `tracesSampleRate: 1.0` and navigation/React Native tracing integrations. The root registers the navigation container (`src/features/app/RootLayout.tsx:78`); installed navigation integration listens to actions/state (`node_modules/@sentry/react-native/dist/js/tracing/reactnavigation.js:118`). Effective reporting depends on enabled build configuration/DSN; discarded/no-op transactions mean not every dispatch necessarily uploads a transaction.

`src/features/app/hooks/useTelemetry.ts:30-83` emits previous-screen leave, screen, and flow-view events on changed screen names. PostHog requires a nonempty key, enabled build configuration and delayed initialization (`analyticsService.ts:73-103`). Its session timer resets rather than accumulating per navigation.

`src/constants/app-config.ts:85` enables performance traces unconditionally. `src/utils/TraceService.ts:43-57` emits a metric plus an info log at trace completion; `src/utils/logger.ts:73-130` sanitizes, formats, buffers and prints permitted metric/trace/info output in production. The 200 ms threshold gates reporter forwarding, not local trace output. Account balance/projection runs and hydration subscriptions reach this instrumentation, but warm idle switches do not necessarily start new full calculations. Underlying work may dominate its logging.

Counterevidence: PostHog explicitly disables replay, lifecycle events, and error autocapture. Sentry disables native reporting/screenshots/view hierarchy and supplies no replay sampling options (`analyticsService.ts:34-45,73-89`). Thus neither an installed dependency nor the observed configuration supports blaming active session replay. Installed Sentry JS stall tracking schedules 50 ms checks only while root spans exist, stops without roots and pauses in background (`node_modules/@sentry/react-native/dist/js/tracing/integrations/stalltracking.js:42,192`); this is bounded recurring activity, not evidence of significant CPU/thermal cost.

**Next discriminator:** on the same device/build/data, separately disable local performance trace output, Sentry navigation tracing, and route events. Keep timing instrumentation independent of the logger being evaluated. Candidate intervention: gate production trace output or use a justified navigation sampling policy only if materially beneficial; preserve error diagnostics/privacy sanitizers.

### N9 — destination-specific computation and loading

**Evidence: E2 computation/read paths; magnitude unknown. Covers H1/H6. These do not explain every lightweight tab switch.**

**Accounts:** `src/features/accounts/hooks/useAccountsListViewModel.ts:231,300` runs archive visibility → search → tab filtering → section transformation. `src/contexts/ArchiveVisibilityScope.tsx:64-85` defaults pinned IDs to `new Set()` and uses the set in memo dependencies. Under source-level semantics that permits unchanged account inputs to produce fresh filtered arrays on local rerenders, feeding section reconstruction. Actual React Compiler treatment and runtime call frequency are unverified. `src/features/accounts/utils/transformAccounts.ts:115-140` sorts/builds parent maps/flattens; view-model cache misses search the section for each parent (`:235`). Collapsed-section rows are discarded after flattening (`:253-264`). The rotating row caches and expansion gates reduce work; the default overall period does not run the separate 30-day totals query. **Discriminator:** count/time transform calls for an unchanged account dataset across actual navigation/local-state changes; inspect compilation/identity before a memoization fix. Candidates: stable empty input identity, direct parent lookup, and skipping unneeded collapsed-section work, if material.

**Analytics `/reports`:** `src/features/reports/hooks/useReports.ts:55` requests history, full report snapshot and previous-period totals independent of which internal subsection is visible. `src/services/reports/reportingPeriodLoader.ts:70` materializes matching income/expense postings; `src/services/report-service.ts:110` constructs several report products. Chunking in `src/data/repositories/transaction/TransactionQueryRepository.ts:140` bounds query width/concurrency, not total returned postings. Default range is 30 days, but transaction density is not capped. Historical wealth reconstruction can cover today back to the requested start (`src/services/wealth-service.ts:216,285`). Internal subsection changes alone do not reload the full snapshot. **Discriminator:** split read/FX/enrichment and report-product calculation; compare visible-subsection demand loading while sharing source data. Preserve currencies, period boundaries and totals.

**Forecast in `/reports-v2`:** `src/features/reports-v2/hooks/useReportsV2ViewModel.ts:88,141` starts engine work after an initial/filter timer; `src/services/reports-v2/reportQueryEngine.ts:634` calls the synchronous calculator. `src/services/reports-v2/calculators/planning/forecastCalculator.ts:33-60` scans the fact streams for each day, with linear cash-account membership checks: worst-case day × fact × cash-account work. `planningUtils.ts:89` has no explicit day cap, although default query period is month-to-date and planned inputs are conditional. Section changes can reread inputs; account filtering happens after postings materialize (`reader/ledgerFactReader.ts:316`). Forecast requests opening and closing balances although its calculator consumes opening cash (`reportInputReader.ts:268`). Sequence guards suppress stale publication, not running calculations. **Discriminator:** separate read/valuation/calculator timing at the same dataset/range. Candidates: daily buckets, a cash-account set, and input reuse if the trace supports them. This is a Forecast-specific path, not a universal bottom-tab explanation.

**Journal/Dashboard bounds:** initial journal queries take 15 rows before enrichment (`src/features/journal/hooks/useJournalList.ts:69`, `src/data/repositories/journal/JournalObserveQueries.ts:74`). Pagination reloads a growing prefix (`src/hooks/usePaginatedObservable.ts:161`), so deep pagination changes the cost/retained-data question. Dashboard also prepares explanation arrays while their UI is closed (`src/features/dashboard/mappers/SafeToSpendMapper.ts:147`) and scans planned inputs (`src/features/planned-payments/hooks/usePlannedOccurrences.ts:48`). These transforms have memoization; every tab return is not established to rerun them. **Discriminator:** first entry versus settled revisit versus deeply paginated revisit; defer only measured unnecessary products.

### H13/H14 additional lifecycle and thermal limits

Foreground maintenance schedules rebuild/projection cleanup and Android SMS catch-up 500 ms after inactive/background → active (`src/features/app/hooks/useAppForegroundMaintenance.ts:16-61`). Forecast date basis also refreshes on foreground, including same-day resumes (`src/services/simulation/forecastDateBasis.ts:23`). Automatic SMS import defaults off, requires permission/workplace, and uses a single active run; its 50-message pages can drain repeatedly (`src/services/preferences/deviceTypes.ts:25`, `src/services/sms/AutomaticSmsImportService.ts:75,100`). These paths can overlap early interaction but are not scans started by each ordinary tab switch.

Update checks run on mount/active events, deduplicate concurrent work, and have endpoint/Play eligibility gates (`src/features/app/UpdateGate.tsx:71`, `src/services/update/appUpdateService.ts:141`, `playUpdateService.android.ts:20`). Widget publication debounces 500 ms and rejects stale leases, while its root forecast subscription stays active (`src/features/app/hooks/useWidgetSync.ts:111,173`). Insight timers refresh hourly and use a 90-day history window (`src/services/insight/InsightService.ts:65`, `src/constants/app-config.ts:212`); this is not per-tab polling. Android widgets configure no periodic update interval.

No inspected application path measures thermal or power-saver state, and no device observation establishes throttling, sustained CPU activity or battery impact. **Discriminator:** repeat identical settled navigation on the same device in cool/warmed and power-mode conditions while recording system state. No thermal mitigation is justified by static source alone.

### H9 additional bounds — retained datasets are not proof of a memory leak

Dashboard and Activity start with 15 journals; pagination increases a cumulative limit and keeps loaded arrays/grouped representations (`src/features/journal/list/screens/JournalScreen.tsx:18`, `src/hooks/usePaginatedObservable.ts:163,193`, `src/hooks/useJournalListGrouping.ts:37`). FlashList bounds mounted rows, not all loaded data. Repeating the same tab switch does not append pages. Account render view-model buckets are bounded to two rotating 1,000-entry maps, while metadata has no eviction by account/type/color/theme key (`src/features/accounts/utils/transformAccounts.ts:80,186,240`). Identical revisits reuse keys. Native memory, post-GC growth, and thermal effects remain unmeasured.

### H4/H11 — repeated full remounts and every-switch font loading are weakened

Lazy first mounts, retained tabs, and dependency-based cleanup do not support full remount on every warm bottom-tab visit. Conditional internal tab views can remount. `src/features/app/hooks/useFonts.ts:16` and `src/utils/loadFontSet.ts:21` cache loaded/in-flight selected font sets; installed font packages are not evidence of loading every font on every switch. First visits/startup can still compete with navigation. `useAppBootstrap.ts:62,100,139` schedules idle work followed by a three-second delay and starts several warmup/maintenance tasks with cancellation guards; its dependencies are readiness/workplace/currency, not pathname.

### Build and ABI controls

`scripts/run-android.mjs:17` defaults local Android to development. `eas.json:23` configures ARM64-only preview; production targets ARM64 plus ARMv7. Hermes/New Architecture and release minification are configured, not verified on the installed phones. Broad native-library `pickFirst` rules exist, but a wrong-library selection was not established.

The native specialist inspected existing `build-1791741540279.aab`: both ARM ABIs have the same 34 native-library filenames, including Hermes/Watermelon/MMKV/Nitro/QuickCrypto, with appropriate ARM32/AArch64 ELF headers. Its JS has Hermes bytecode magic. However embedded metadata identifies production commit `94872ad`, older than this checkout. It proves packaging of that older artifact, not what either phone runs or that native initialization succeeds.

simdjson has ARM64/portable implementations, but its inspected Watermelon use is JSON batching, not the raw-read path above. QuickCrypto has an ARM64 BLAKE3 NEON build branch, but no relevant navigation caller was found. These are weaker than checking actual dispatcher selection/build parity. No architecture-only root cause is established.

## Proposed discriminating device checks (not executed)

1. Record model, OS, RAM, supported and installed ABI, commit, package variant, `__DEV__`, engine, dataset cardinalities, font/reduced-motion settings, thermal/power conditions, and time since launch. Different devices confound ABI with CPU, storage, memory, GPU, and OS differences.
2. On each affected device, use the same release build family and synthetic dataset. Compare first visits with repeated visits, immediately after launch with settled idle, and before/after visiting all tabs. Do not pool these populations.
3. Use a lightweight tab such as Settings as the navigation control, then compare Dashboard, Accounts, Activity, and Commitments. Confirm actual route/readiness contracts before automating. Record input event, JS handler start, destination render/commit, first meaningful content, and a second successful interaction separately.
4. Correlate JS/React work with native frame scheduling and I/O on the affected ARMv7 device. Record aggregate SQL/materialization, observer emissions, transforms, snapshot serialization/storage, logging, and destination commit separately; avoid private financial values in artifacts.
5. Isolate one candidate at a time in a disposable instrumentation change: destination placeholder preserving navigation, suspended hidden-screen work, disabled performance trace logging, bypassed snapshot persistence preserving fresh in-memory data, reduced animations, or one deferred background job. Recheck correctness/freshness before treating an isolation as a product fix.
6. Where one physical device/OS supports both ABIs, compare equivalent release builds on that same hardware; otherwise keep the ABI explanation unresolved. A comparison between a fast ARM64 device and a slower ARMv7 device cannot attribute causality to architecture alone.

No timing, frame-rate, memory-leak, thermal, or expected percentage-improvement claim follows from this static investigation.

## Coverage reconciliation and decision

- All fourteen requested hypotheses plus two build/ABI controls have a current-source disposition. Six specialists completed read-only investigations; the parent reconciled overlapping claims and directly reopened the SMS route/queue/query chain, raw adapter/native SQLite/fallback, Workplace provider, snapshots/replay, telemetry configuration, account transformation and Forecast calculator.
- This is scoped static navigation coverage, not a claim of exhaustive source coverage or device validation. Source evidence reaches E1/E2 only. Actual ARMv7 input latency, native frame behavior, GC, dispatcher selection, thermal state and installed build parity remain unmeasured.
- Read areas: root/router/tab lifetimes and installed navigator; app providers/readiness/fonts; account/activity/dashboard/commitments and report/forecast destinations; reactive balance/insight/budget/timeline/cache owners; SQL/schema/query/materialization/native dispatcher; snapshot/preferences/MMKV; row/chart/SVG/layout/cache owners; telemetry/logger/SDK listeners; bootstrap/foreground/SMS/notifications/widgets/update paths; EAS/Gradle/native packaging and one pre-existing historical AAB; existing audit metadata and navigation test source. Generated/build outputs were not treated as current source evidence; the old AAB is explicitly limited above. No private user datasets were read or emitted.
- Weakened explanations: repeated full bottom-tab remounts, every-switch font loading, universal expensive bottom-tab transitions, enabled PostHog replay, ordinary-tab automatic SMS scanning, unbounded per-navigation session timers, generic preference reads on each tap, and architecture branches unrelated to traced navigation.
- Open diagnostic order: establish installed build/ABI/data parity; observe JSI/raw-query capability; isolate route-triggered notification work and production instrumentation; trace synchronous SQL/transforms/snapshot work; then investigate retained graphs/provider commits and destination-specific layout/calculation. This order is for falsification and causal isolation, not a preapproved optimization sequence.
- No product fixes were made. A future implementation should target the mechanism confirmed on the affected device, with separate before/after navigation readiness and correctness checks. Exact test/build execution remains subject to the user's request; none was run during this investigation.
