# Full Frills Balance — React/UI performance audit

Date: 2026-08-25  
Scope: React/rendering, navigation, lists, scrolling, animation/chart, images/assets/fonts, startup/module evaluation, and UI lifecycle.  
Validation level: `L0 STATIC COMPLETE`. No device trace, profiler capture, frame-time run, memory sample, or production telemetry was available in the workspace. `E1` means static signal; `E2` means the execution path and scaling behavior are established from source/config. No E3–E5 claims are made.

## Verdict

The production UI has four static risks worth measuring. The first is the clearest boundedness problem: bulk journal entry rows are rendered in an ordinary `ScrollView` and have no cap. The other three are workload-sensitive: bar-chart scrolling sends every 16 ms scroll event through React state; account-tree drag updates cross from the gesture/UI runtime into JS on every update; and startup eagerly evaluates a wide service/font/module graph before the first usable screen.

Existing journal/account/audit/budget/planned-payment lists use FlashList or SectionList with pagination or explicit render-window tuning. Their presence alone is not a finding.

## Findings / static risks

### UI-01 — Bulk journal editor renders every row in one ScrollView

Evidence: `E2 STATIC RISK`.

Files: [BulkEntryGrid.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/journal/entry/components/BulkEntryGrid.tsx:130), [useBulkJournalEditor.ts](/Users/sahilsoni/me/projects/full-frills-balance/src/features/journal/entry/hooks/useBulkJournalEditor.ts:63).

Trigger: open bulk journal entry, press “Add Entry Row” repeatedly, then type/edit/scroll with a large row count.

Mechanism: `BulkEntryGrid` maps `rows` directly into `BulkEntryRow` children inside `ScrollView` (lines 130–187). `addRow` appends without a maximum (lines 72–79). Each field edit creates a new full `rows` array (lines 194–227); validation also scans every row (lines 229–232). Therefore mounted React/native row count and per-update array work grow with `N`.

Scaling factors: row count `N`; number of inputs/controlled fields per row; edit frequency; cross-currency account changes, which scan the full row array and may issue rate work (lines 100–190); keyboard/layout cost; device class.

User consequence: not established. The deterministic risk is mount/update work and retained view hierarchy growing linearly with `N`; no latency or frame claim is made.

Rejected alternatives: this is not a generic “ScrollView bad” finding. Small, bounded forms are fine; the finding depends on the user-controlled, uncapped row count.

Next measurement: on release Android and iOS, seed bulk entry with 10/50/100/250 rows. Record JS commit duration, UI frame time during typing and fling, memory, and input latency. Compare a controlled cap or virtualized prototype against the current path.

### UI-02 — Bar-chart horizontal scrolling drives React state at 16 ms cadence

Evidence: `E2 STATIC RISK`.

File: [BarChart.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/components/charts/BarChart.tsx:48).

Trigger: reports screen → a report containing a horizontally scrollable bar chart → continuous drag/fling across many data points.

Mechanism: `onScroll` calls `setScrollX` for every event with `scrollEventThrottle={16}` (lines 192–197). `scrollX` participates in tooltip geometry (lines 98–121), so each state update re-renders the component. The SVG then maps every point and every series to bar/overlay nodes (lines 224–263), while chart width is `O(data.length)` (lines 50–56).

Scaling factors: chart point count `P`; series count `S`; scroll-event rate; tooltip/selection state; SVG node count roughly `O(P×S)`; device UI/JS thread contention; number of charts mounted in the report.

User consequence: not measured. The static path proves JS work is coupled to scroll cadence and full-SVG render cardinality, not that a target device drops frames.

Rejected alternatives: line-chart geometry is memoized and gesture state changes are deduplicated by index in [useChartInteraction.ts](/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/useChartInteraction.ts:90); that does not remove the separate bar-chart scroll state path.

Next measurement: capture a 5 s fling with `P=30/90/180` and `S=1/2` in release Hermes builds. Correlate JS long tasks, React commits, UI FPS, and scroll velocity. A discriminating comparison is keeping `scrollX` on the UI/native side or sampling it below display rate.

### UI-03 — Account-tree drag crosses to JS on every gesture update

Evidence: `E2 STATIC RISK`.

Files: [AccountManagementTreeRow.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/accounts/components/hierarchy/AccountManagementTreeRow.tsx:59), [useAccountTreeDragController.ts](/Users/sahilsoni/me/projects/full-frills-balance/src/features/accounts/components/hierarchy/useAccountTreeDragController.ts:133), [AccountManagementTreeList.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/accounts/components/hierarchy/AccountManagementTreeList.tsx:105).

Trigger: account management → Organize → long-press and drag an account through a populated hierarchy, especially near an auto-scroll edge.

Mechanism: the gesture worklet invokes `runOnJS(onUpdate)` for every update (row lines 63–69). `updateDrag` sets React state, computes hover, and ensures auto-scroll (controller lines 252–260). Hover resolution searches rows and computes drop geometry, then calls `setHover` when the target changes (lines 133–193). Auto-scroll schedules a `requestAnimationFrame`, calls `scrollToOffset`, updates React state, and recomputes hover (lines 208–243).

Scaling factors: gesture update rate; flattened row count `N`; row-height map size; frequency of hover-target changes; auto-scroll duration; row render cost and list recycling; JS/UI contention.

User consequence: not measured. Reanimated keeps the row transform animated, but the drag decision path is still JS-bound and can become the limiting path under large `N` or continuous edge scrolling.

Rejected alternatives: ordinary list scrolling is not implicated: `onListScroll` only updates a ref (controller lines 291–293). The risk is the organize-mode drag path.

Next measurement: trace a 3 s drag at 20/100/300 rows with and without edge auto-scroll. Measure `runOnJS` call rate, JS frame occupancy, UI frame time, React commits, and gesture-to-hover latency.

### UI-04 — Cold-start module evaluation is broad and font assets are statically imported as one graph

Evidence: `E2 STATIC RISK` for the execution graph; runtime cost unknown.

Files: [index.js](/Users/sahilsoni/me/projects/full-frills-balance/index.js:1), [RootLayout.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/app/RootLayout.tsx:1), [useFonts.ts](/Users/sahilsoni/me/projects/full-frills-balance/src/features/app/hooks/useFonts.ts:5), [useAppBootstrap.ts](/Users/sahilsoni/me/projects/full-frills-balance/src/features/app/hooks/useAppBootstrap.ts:11), [app.config.ts](/Users/sahilsoni/me/projects/full-frills-balance/app.config.ts:1).

Trigger: process launch/cold start, before the first route is interactive.

Mechanism: the entry imports analytics, the font hook module, and Expo Router before splash control (index lines 5–20). Root layout eagerly imports the database, analytics, Sentry, PostHog, chart provider, and app-wide bootstrap/lifecycle hooks (RootLayout lines 1–29). `useAppBootstrap` statically imports multiple cache/read/maintenance services (lines 11–21). `useFonts` statically imports all font families/weights (lines 5–19); only the selected set is passed to `Font.loadAsync` at runtime (lines 58–95), but all imported assets remain in the initial module graph/bundle. This is separate from later background work, which is intentionally delayed to 50 ms and after interactions (useAppBootstrap lines 57–102 and 110–179).

Scaling factors: bundle/module graph size; native module initialization cost; selected font set and font byte size; Hermes bytecode/evaluation; cold vs warm cache; release vs dev build; device CPU/storage.

User consequence: not established. The app already logs splash hide/TTI and font-load duration in [RootLayout.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/app/RootLayout.tsx:115) and [useFonts.ts](/Users/sahilsoni/me/projects/full-frills-balance/src/features/app/hooks/useFonts.ts:61), but no run data was present.

Rejected alternatives: `app.config.ts` synchronously runs asset generation and `git rev-parse`, but that is Expo config/prebuild evaluation, not the installed app’s runtime startup path. It should not be called a mobile TTI finding without build-command evidence.

Next measurement: cold-start release builds on low/mid/high Android and iOS devices. Capture JS start, first root render, font-ready, data-ready, splash-hide, first interaction, Hermes module-evaluation profile, bundle/asset sizes, and native startup. Compare selected-font loading and lazy service imports only in an isolated experiment.

## Surface dispositions

- Navigation: Expo Router stack/tab routes are statically mapped in [AppNavigation.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/app/components/AppNavigation.tsx:23) and [TabsLayout.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/app/TabsLayout.tsx:5). No route transition or screen-retention defect is statically established. `slide_from_bottom` and modal/card presentations are configuration signals only.
- Journal, audit, budget, and planned-payment lists: FlashList is used in [JournalEntryListView.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/components/common/JournalEntryListView.tsx:140), [AuditLogView.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/audit/components/AuditLogView.tsx:39), [BudgetListView.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/budget/components/BudgetListView.tsx:24), and [PlannedPaymentListView.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/planned-payments/components/PlannedPaymentListView.tsx:28). Journal pagination starts at 20/15 items and expands on demand ([app-config.ts](/Users/sahilsoni/me/projects/full-frills-balance/src/constants/app-config.ts:69), [usePaginatedObservable.ts](/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/usePaginatedObservable.ts:224)); no list FPS claim is justified without traces.
- Accounts list: SectionList has explicit initial/batch/window tuning at [AccountsListView.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/accounts/components/AccountsListView.tsx:214). The account-management hierarchy separately uses FlashList, so those are different workloads.
- Journal grouping: [useJournalListGrouping.ts](/Users/sahilsoni/me/projects/full-frills-balance/src/hooks/useJournalListGrouping.ts:33) rebuilds groups, sorts each day, computes stats, and maps rows when the current page changes. This is `O(N log N)` in the current page, but pages are intentionally bounded and no measured bottleneck exists; retained as an instrumentation target, not a finding.
- Reports and charts: reports render only the active tab’s section in [ReportsView.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/reports/components/ReportsView.tsx:36). The bar-chart scroll path is the only chart risk promoted above an investigation target.
- Images/assets: no production screen source was found using raster `Image`/`expo-image`; app icon/splash/favicon assets are configured in [app.config.ts](/Users/sahilsoni/me/projects/full-frills-balance/app.config.ts:35). No image decode/render finding.
- Animation/lifecycle: app foreground maintenance debounces queue flushing and cleans up its subscription/timer ([useAppForegroundMaintenance.ts](/Users/sahilsoni/me/projects/full-frills-balance/src/features/app/hooks/useAppForegroundMaintenance.ts:16)). No lifecycle leak is established. The account drag path is the material lifecycle/animation target.

## Rejected hypotheses

1. “Every `ScrollView` is a performance bug.” Rejected. Several are bounded filter/header/modal/form surfaces; only the uncapped bulk-row surface has deterministic unbounded growth.
2. “All list render callbacks are unstable.” Rejected as a broad claim. Accounts explicitly memoizes `renderItem`/`keyExtractor`; journal uses FlashList and type keys. Remaining inline callbacks are not enough to infer material cost.
3. “Startup background hydration blocks the first frame.” Rejected from static tracing. The app marks data hydrated immediately, delays core work 50 ms, and schedules stabilization after interactions. Its actual impact still needs a trace.
4. “The chart interaction registry broadcasts on every chart gesture.” Rejected for the observed path. Global reset is responder-capture/tap driven; chart gesture updates are local. Bar-chart scroll state remains a separate risk.
5. “The DEV AI example proves a production chat/list issue.” Rejected for production scope. Its token-by-token state updates and unvirtualized chat are dev benchmark UI in [AiExampleChatPanel.tsx](/Users/sahilsoni/me/projects/full-frills-balance/src/features/journal/components/AiExampleChatPanel.tsx:42), not a production route finding.

## Blockers and prohibited claims

- No attached release build, device model/OS matrix, Hermes profile, React DevTools commit trace, UI frame-time capture, memory sample, or representative dataset run.
- No user-impact, latency, FPS, memory, battery, or TTI magnitude can be claimed.
- No production code was changed. `bun run typecheck` passed; this is a static audit, not a runtime validation.

## Measurement order

1. Bulk editor at 10/50/100/250 rows: input latency, JS commits, UI frames, memory.
2. Bar chart at 30/90/180 points and 1/2 series: scroll FPS, JS long tasks, commits, SVG render cost.
3. Account drag at 20/100/300 rows, with/without edge auto-scroll: JS/UI frame timelines and `runOnJS` rate.
4. Cold-start release profile: module evaluation, font load, splash hide, first interaction, bundle/assets, and native startup.
5. Journal list with 20/100/500/1000 current items: observable emission → grouping → commit timing, to determine whether the bounded `O(N log N)` grouping path matters in practice.
