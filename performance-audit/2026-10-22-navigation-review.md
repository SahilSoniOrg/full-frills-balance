# Navigation performance review — 2026-10-22

## Status and verdict

**Fixable structural risks; the Samsung A17 bottleneck is not yet measured.** The most relevant common navigation trigger is SMS notification reconciliation. Account opens also enter synchronous, history-dependent database work. Fresh-install index drift adds a separate, established query-plan disadvantage. Retained detail subscriptions amplify later ledger changes but cannot alone explain a quiet, warmed app.

- Repository: `a42bafe531f7286739863073f45ee546f63c8359`.
- User evidence: Samsung A17; delays remain after the app has been open and idle for a minute. Treat settled navigation as the primary workload. Launch-only explanations are insufficient.
- Coverage: **INCOMPLETE for an exhaustive current-repository audit**. This review traces accounts, journal entry/detail, and their common infrastructure; broader workloads are sampled and explicitly dispositioned below.
- Validation: **L0 ceiling, with incomplete whole-repository coverage**. E2 source evidence and local empty-schema SQLite plans; no L1 application-workload validation, E4 device causality, or field prevalence.
- Inspected-source ledger: [103 source/configuration records](2026-10-22/reviewed-sources.csv), including 71 analyzed surface owners and 32 files mapped through relevant sections. These counts do not imply all repository files were analyzed.
- No production source changes, tests, builds, seeded app data, financial mutations, or external-service queries. Added only this review and audit artifacts. The local query-plan experiment ran against empty, in-memory desktop SQLite databases.
- Pre-existing untracked `performance-audit/navigation-armv7-investigation.md` and older audit artifacts were preserved.

**Do not read the priorities below as measured severity.** Accepted items are P2 / E2 `STATIC RISK`. Milliseconds, improvement percentages, A17 frame behavior, and the relative share attributable to each mechanism remain unknown.

## Environment and evidence limits

Installed checkout dependencies: Expo 57.0.25, React Native 0.86.3, React 19.2.3, Expo Router 57.0.23, FlashList 2.3.2, WatermelonDB 0.28.1-0, RxJS 7.8.2. React Compiler is configured in Babel; transformed consumer behavior was not profiled. Native configuration requests WatermelonDB JSI. An asynchronous adapter fallback remains possible if installation fails; A17 dispatcher selection is unknown.

Only `emulator-5554`, Android 16 / `sdk_gphone64_arm64`, is attached. The development client was initially on its error activity. The preview package is ARM64, version 1.0.0/code 1, not debuggable, installed October 21; its source revision is unverified. After resolving its actual launcher (`in.sahilsoni.fullfrillsbalance.MainActivity`), the preview dashboard appeared behind a **System UI isn't responding** dialog. A back/collapse attempt did not clear the dialog. Stop runtime attribution here: aggregate `gfxinfo` was not tied to a scripted action and is contaminated by the unhealthy environment. No app timings or screenshots from this attempt are retained as performance evidence.

The A17's exact variant, RAM, Android version, installed build/revision, ABI, dataset, and interaction durations remain unknown. Device model alone does not establish an ARMv7 process. No iOS, representative lower-tier physical device, release-matched repeated workload, native trace, or React profile was available.

Historical profile drift: the skill's August profile is at its root rather than its referenced `references/` path. Its dependency versions and on-device-AI paths are not assumed current. Current snapshots defer/coalesce writes; current account detail balances are subtree-scoped. Earlier proposals to make those changes are not new findings.

## Runtime and workload map

Root layout → native database/provider setup → launch/workplace gates → unlocked navigation stack. Dashboard and widget consumers share the workplace Safe-to-Spend pipeline. Dashboard/account-list consumers share aggregate balances. Visited tabs retain React trees; keyed replay streams can outlive their views. Route changes also reach SMS maintenance and telemetry.

Native raw reads: application async wrapper → JSI host function → SQLite execution and row materialization under its mutex → JavaScript normalization/enrichment → observable emission → React rendering. The `async` keyword does not move the host function's execution to a worker.

| Workload | Traced path and visible completion | Evidence and remaining question |
|---|---|---|
| W1 Accounts tab | `useAccountsListViewModel` → shared aggregate SQL/wealth pipeline → account sections → usable first rows | E2. A warm cache can replay; tab switching does not inherently rerun aggregate SQL. Need tap-to-ready trace and query count. |
| W2 Account details | details data → subtree balances; current/previous period metrics; unreconciled metrics; date-bounded chart; paginated journals → summary and usable rows | E2. Preview route params can paint summary before hydration. Cold key versus cached key and leaf versus parent need separate measurements. |
| W3 New entry | entry shell → shared accounts → composer/split projection + initial batch state → simple form ready for input | E2. No existing-journal load without an ID. Suggestions start only when explicitly engaged. No dominant form-specific cost established. |
| W4 Edit/copy entry | editor loader → journal and legs in parallel → linked account metadata → hydrate form | E2. Loading gate waits for this chain. Does not fetch every journal. Need query versus hydration/render timing. |
| W5 Existing journal details | journal + enriched legs + currencies → summary; source/SMS, budget impact, history, optional planned-payment read start alongside | E2. Source/budget/history are not included in the main loading gate, but can compete for execution. |
| W6 Settled navigation | route change → SMS reconciliation + telemetry; pathname reaches workplace-provider owner | E2 route maintenance; E1 provider render amplification. Primary A17 scenario; native/React traces blocked. |
| W7 Post-save/browsing session | ledger change → shared meta/count/FX observers → aggregate, retained account dashboards, forecast, visited tabs | E2 fan-out. Requires a relevant emission; ordinary idle time is not proof of ongoing work. |
| W8 Startup/resume | idle callback + three-second stabilization batch; foreground maintenance after resume | E2 overlap possible; downgraded as explanation of W6 after user clarified settled idle behavior. |

## Accepted static risks

### P-01 — Route changes enqueue notification reconciliation without coalescing

**Priority P2; E2; STATIC RISK. Workloads W1–W6. Native app; notification/inbox state controls scale.**

Evidence: `useSmsNotificationLifecycle.ts:47–57` updates foreground suppression and calls `refresh()` on pathname changes. `SmsReviewNotificationService.ts:60–63` appends each call to a promise queue. `deliverPending` at `:87` loads preferences, reconciles notifications, fetches pending device records, and may look up individual inbox/group members. `NotificationService.ts:157–179` enumerates presented and scheduled native notifications. The observable's `auditTime(0)` does not coalesce these direct route calls.

Mechanism: navigating between unrelated pages schedules another delivery pass. Every completed pass performs reconciliation work even when no notification needs delivery. Rapid route changes can queue additional passes; actual backlog is unmeasured. Work is not awaited by the navigation handler, so this establishes competition after navigation, not a proven synchronous navigation gate.

Smallest intervention: continue updating suppression immediately, but refresh when the effective suppression/privacy/inbox state changes; coalesce concurrent refresh requests into a current pass plus a dirty rerun. Preserve retryability and reconciliation when returning to foreground, locking, changing privacy, entering/leaving SMS review, or resolving a notification. No blanket disabling of notification work.

Verification: same release build, settled A17, empty and synthetic populated outbox states; record route taps, refresh requested/started/finished counts, native enumeration and lookup durations, JS long tasks, first usable destination frame. Compare one route change and rapid alternating routes with the maintenance requests narrowed. Check suppression/delivery/privacy behavior separately when tests are authorized.

Confidence limit: no isolated causal delay or device measurement. Empty inboxes reduce per-record work; native enumeration remains reachable.

### P-02 — Fresh installs omit useful indexes that migrated installations receive

**Priority P2; E2; STATIC RISK, with local query-plan evidence. Workloads W1/W2/W4/W5; fresh schema versus upgrade history matters.**

Evidence: current schema is version 34. Composite indexes such as `idx_transactions_workplace_account_chrono`, `idx_transactions_workplace_journal`, `idx_journals_workplace_status_chrono`, and `idx_balance_snapshots_workplace_account` exist in migration 25 (`migrations.ts:631–674`) and are absent from the fresh schema. WatermelonDB's installed adapter takes separate schema-creation and migration branches (`adapters/sqlite/index.js:86–139`); fresh creation does not replay old migration SQL. Existing simpler indexes remain present, so this is not an absence of all indexing.

Experiment: encode the actual schema using the installed WatermelonDB encoder; create two empty in-memory SQLite 3.54.0 databases; add those four migration definitions to one; inspect plans. [Raw SQL and plans](2026-10-22/query-plans.json), [encoded fresh schema](2026-10-22/fresh-schema.sql), [reproduction helper](2026-10-22/inspect-query-plans.cjs).

| Query | Fresh schema | Fresh schema + selected migration indexes |
|---|---|---|
| Exact `getLatestBalancesRaw` template, one account | `idx_transactions_account_date`; `USE TEMP B-TREE FOR LAST 2 TERMS OF ORDER BY` | `idx_transactions_workplace_account_chrono`; that temporary sort disappears |
| Representative journal timeline SQL | Temporary order-by tree | Temporary order-by tree remains |
| Representative detail legs SQL with deleted rows included | Temporary order-by tree | Temporary order-by tree remains |

Mechanism: installation history changes available access paths. The exact latest-balance query ranks account history by date, creation time, and ID; the fresh schema's selected index covers only part of that ordering. More matching history increases input to this work. This is a credible explanation of differences between installations, not proof of the A17's schema state or elapsed cost.

Smallest intervention: centralize the still-useful current index definitions for fresh creation and add a forward migration for already-created version-34 databases. Do not edit only historical migration 25 or assume every old index remains desirable. Review reset/import index recreation paths as part of implementation.

Tradeoff: index storage and write maintenance. Keep current-table, relevant definitions; do not resurrect removed SMS tables or blindly copy every historical index. Financial semantics and workplace scoping must stay identical.

Verification: compare actual `sqlite_master`/`PRAGMA index_list` and query plans on fresh and upgraded disposable databases; then compare matched synthetic histories on the same A17/build, recording native SQL and row materialization separately from React. Current experiment is schema/plan evidence only: zero rows, desktop SQLite, no timing, no complete upgraded-schema simulation, and two queries represented rather than captured from the ORM.

### P-03 — One account dashboard stays subscribed for each visited account key

**Priority P2; E2; STATIC RISK. Workloads W2/W7. Scale: distinct visited keys × account metadata + scoped balance work.**

Evidence: `ReactiveDataService.ts:238–300` caches by account/currency/workplace. Each source observes workplace accounts, all journal metadata, active transaction count, and exchange rates. `ReactiveCacheCoordinator.ts:44–67` has no per-detail capacity/expiry; `disposableReplay.ts:18–35` removes only the downstream subscriber on unsubscribe and keeps upstream alive until explicit disposal. Workplace switch/delete, restore, and maintenance have disposal paths; ordinary account-page departure does not.

Mechanism: open A, leave; open B, leave; both graphs remain live. A later relevant journal/count/account/rate emission can rerun both scoped balance hydrations while another page is visible. Each graph retains a separate plain-account snapshot in its result. This establishes session-history-dependent work and storage; it is not proof of a leak, GC pause, or continuous idle computation.

Smallest intervention: give detail graphs a screen/subscriber lifetime, optionally retain a bounded plain-data snapshot for revisits. Preserve app-lifetime sharing for intentionally global aggregates. If using eviction, do not evict live consumers or complete a mounted observer without a refresh path. Fresh financial data must reconverge on re-entry.

Verification: record upstream graph/subscriber counts while opening 1, then several distinct synthetic accounts and returning. Apply one unrelated ledger mutation, count detail hydrations and queries, inspect allocations/retained owners, then revisit an earlier account and switch workplaces. Compare same conditions before/after. No resource magnitude currently measured.

### P-04 — Latest-balance reads rank history on the JavaScript calling path

**Priority P2; E2; STATIC RISK. Workloads W1/W2 and W7 emissions. Scale: eligible transaction history in selected accounts.**

Evidence: `AccountListMetricsQueries.ts:35–55` and `TransactionRawMetricsQueries.ts:131–164` select latest balances using a window over matching transaction history, then filter `rn = 1`. Output account count is not the same as history processed. `DatabaseUtils.ts:34–35` calls the native host function inside an async wrapper. Installed C++ `Database-query.cpp:126–142` executes and materializes rows synchronously under a mutex. The plan experiment shows the account-detail window path and one avoidable sort; it does not measure rows visited or total time.

Mechanism: a newly visited account key triggers its latest-balance query; the scoped parent case includes descendants. SQL/native work occupies the caller until it returns. The list has a workplace-wide latest-balance window when its shared graph hydrates/invalidates. Snapshot-bounded counts are a separate optimization and do not eliminate this latest-balance window.

Candidate intervention: after index parity, compare index-backed `ORDER BY ... LIMIT 1` reads for a small account scope against the window query. Keep a batched strategy where it wins. Preserve exact status/deletion/workplace filters, cutoff dates, deterministic tie order, and balances after rebuilds; do not bypass validation or change financial results. Avoid introducing another persisted balance store before measuring this simpler read strategy.

Verification: isolate first/new-key and warm-key account opens at the same synthetic history shape, trace query duration and materialization, capture actual Android query plans, and count repeated executions. Compare several account histories and a parent subtree. This remains a structural scaling risk, not evidence that SQLite is the dominant A17 bottleneck. Warm Accounts tab replay can avoid the query entirely.

## Open hypotheses and lower-priority opportunities

| ID | Evidence | Mechanism and next discriminator |
|---|---|---|
| H1 Detail metrics restart after dashboard hydration | E2 reachable duplication, magnitude unknown | `useAccountDetailsViewModel.ts:66–83` rebuilds scope from the account array. The two metric subscriptions depend on array identity (`useAccountDetailsMetrics.ts:107,145`), and each starts an independent workplace active-count observer. An account/dashboard refresh can restart both reads even with unchanged ID membership. Record subscription/query counts on leaf hydration; consider structural scope keys and shared scoped invalidation. Timeline IDs already have a structural key, so do not claim it refetches solely because the input array changed. |
| H2 Workplace-provider rerender amplification on navigation | E1 | `LaunchCoordinatorContent` reads pathname, recreates transition callbacks, and renders `WorkplaceProvider`; its context value is constructed in render. React Compiler may stabilize some identities. Need transformed output/React profile to establish actual consumer work; missing manual memoization is not itself a finding. |
| H3 Journal detail starts secondary work immediately | E2 path, cost unknown | Budget scope discovery considers all active budgets; matching budgets observe period transactions and calculate usage. History/source/SMS reads also start immediately. They are not explicit blockers of primary loading. Time these phases before deciding to defer/collapse secondary sections. History is limited by the audit pagination default; do not call it unbounded. |
| H4 Startup/resume interference | E2 path; downgraded for primary scenario | The three-second stabilization batch (`useAppBootstrap.ts:100–136`) starts many independent services together; idle scheduling does not time-slice their later work. Resume can flush rebuilds and SMS catch-up. Distinguish first-minute/resume from settled idle; user clarification weakens this as the main cause. |
| H5 Inactive Commitments data and forecast recomputation | E2 path | Commitments constructs both budgets and planned-payment view models before choosing its visible list (`CommitmentsScreen.tsx:19–20`). Safe-to-Spend also observes per-budget usage. After visiting tabs, a ledger emission can reach multiple consumers. Measure duplicated reads on one mutation; consider cheap badge counts plus visible-panel subscriptions if material. |
| H6 Growing-prefix pagination | E2 path | `usePaginatedObservable.ts:161,193–196` increases the total take limit; enrichment then handles the full returned prefix. Relevant after scrolling, not a standalone explanation of the first 15 rows. Compare page transitions and single-entry mutations at a long scroll depth before changing pagination semantics. |
| H7 Production observability overhead | E2 configuration, E1 material impact | Trace logging is enabled; logger sanitizes/serializes and keeps a bounded 1,000-line buffer. Sentry transaction sampling is 1.0. Route telemetry runs on screen changes. Compare with controlled reduced diagnostics; retain actionable errors. No evidence currently attributes the reported delay to telemetry. |
| H8 JSI fallback on the A17 | E2 conditional branch, selection unknown | The installed library can fall back to an asynchronous dispatcher; raw-query callers then use ORM implementations, including full-history materialization for list metrics. First collect selected dispatcher/raw-query capability in that build. ARMv7 is not established and is not a cause by itself. |

## Rejected or bounded explanations

- **Suggestions scan history on every new-form open:** rejected for an untouched blank form. `useJournalSuggestions` starts disabled (`:31,43`); description focus/change enables it. Suggestion latency after engagement is a separate workload.
- **New entry always loads an existing journal:** rejected. `useJournalEditorLoader.ts:47` returns without an ID; edit/copy loads only the target journal and linked accounts.
- **Hidden entry account picker renders all rows immediately:** weakened. `BaseAccountPickerModal` mounts its child scope/list only when visible. Do not optimize an imagined hidden list.
- **Missing list virtualization explains all screen opens:** rejected as a blanket diagnosis. Account and journal list primitives use FlashList. Actual row/layout cost still needs a profile.
- **Every warm tab change reruns all balance SQL:** rejected as an unconditional claim. Shared caches can replay without recalculation. A source emission or new graph/key must be established.
- **Tab transition animations cause every delay:** unsupported. Installed bottom tabs default to no animation; stack detail/composer routes do have transitions and need separate measurements.
- **All snapshot writes happen synchronously inside aggregate emission:** stale characterization. Writes are deferred/coalesced; serialization itself still runs on JS when the scheduled write executes. Do not claim existing deferral is a worker thread.
- **Retained graphs prove an idle leak or startup batch explains settled idle delay:** rejected as complete explanations. Graph work needs emissions; launch timers alone do not account for the clarified scenario.
- **Add all migration indexes and journal sorts disappear:** contradicted by the two representative journal plans. No universal index speedup is claimed.

No workload receives `NO_MATERIAL_BOTTLENECK_FOUND`: that requires representative application measurements, which this environment did not provide.

## Optimization and measurement sequence

1. Establish the installed A17 build/revision and selected database dispatcher; inspect actual index names without exporting table content. Keep preview/production/development results separate.
2. On that same device after an idle minute, correlate each tap with route commit, query start/end + returned row count, notification-pass start/end, and first usable content/input. Use monotonic `performance.now()`/User Timing; existing `TraceService` metrics are cumulative `Date.now()` offsets, and the analytics reporter only forwards durations at least 200 ms. An absence of slow events proves little.
3. Isolate route-triggered SMS maintenance. It is the clearest shared trigger across the reported destinations. Compare equivalent suppression/privacy state with equivalent requests coalesced.
4. Repair fresh/upgraded index parity and compare the exact affected account query. Independently measure remaining history ranking and metric-subscription restarts. Do not attribute journal or blank-form improvement to an unrelated account index.
5. Bound detail graph lifetime and remeasure after several account visits plus one relevant mutation. Profile provider consumers and remaining render/layout work if settled navigation is still delayed.
6. Only then tune row/chart rendering, secondary detail sections, forecast duplication, diagnostics, or startup scheduling where the trace shows material cost.

For each before/after comparison keep device, build, synthetic data, power/thermal state, refresh rate, cache state, background apps, and action identical. Separate first visit, repeated same-account visit, new account key, blank entry, edit/copy, and existing detail. Collect repeated raw samples sufficient to separate noise; report median and range/IQR rather than a best run. Require a usable row/input as completion, not merely a tab button or splash disappearance. Capture JS/React and native scheduling together when they disagree.

Dataset calibration is open: use the first-run minimum; a typical/large shape justified by privacy-safe counts; and stress data labeled separately. Record journal/leg counts, selected-account history, account tree shape, budgets, pending notifications, and distinct visited keys. Do not call the empty plan database a representative performance dataset. Preserve financial correctness, privacy suppression, archive/deleted behavior, offline behavior, and workplace isolation when implementing changes.

## Coverage and handoff

| Surface | Disposition |
|---|---|
| Navigation, provider/state propagation, reactive lifetime | Analyzed for reported paths; provider/React runtime effect blocked |
| Database schema, indexes, native raw-read path | Analyzed for account/journal paths; local empty-schema plan experiment completed |
| Account/entry/detail rendering and lists | Main view/view-model paths traced; row/chart/native layout cost not profiled |
| Startup/resume, widgets, forecast, reports, commitments, diagnostics | Relevant owners mapped/sampled; not an exhaustive workload or engine audit |
| Images/fonts/assets, bundle/module evaluation | Configuration and root imports inspected; no dedicated current inventory or measurements |
| Import/export/rebuild/write paths, SMS scanning/rules, all settings/onboarding/error flows | Disposal/interference entry points sampled; full cost and lifecycle audit outstanding |
| Native modules/energy/network/filesystem/memory | Raw DB boundary established; other modules partially mapped, no native resource profiles |
| Android/iOS/accessibility/refresh-rate/build/data matrix | Android source and unhealthy local emulator only; physical A17, iOS, representative datasets and controlled frame/memory evidence absent |

No tests were run, per the execution preference. The query-plan experiment can be reproduced from the repository root with:

```sh
node performance-audit/2026-10-22/inspect-query-plans.cjs
```

It regenerates audit-only `fresh-schema.sql` and `query-plans.json` using installed Babel/WatermelonDB plus Python SQLite. One exact account SQL template and two explicitly representative journal SQL shapes are inspected; no app database or data is opened.

Deliverables: this review, reviewed-source ledger, reproducible plan inspector, generated fresh schema, and raw query plans. No request to change the application was inferred from the inspection request. The next evidence needed to identify the actual A17 bottleneck is a source-matched settled-navigation capture on that phone; the safe structural work above remains reviewable without inventing runtime impact.
