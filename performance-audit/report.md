# Full Frills Balance performance audit

## Performance audit status

Repository / commit: `6fb79796782c473f664a2a90ac0ca827c79a9908` / `main`

Coverage: COMPLETE for static source, runtime-map, workload, surface, lifecycle, and hypothesis accounting.

Validation Level: L0 — STATIC COMPLETE.

Validated environments: local repository inspection; TypeScript, lint, and Jest correctness/tooling checks. An iOS release-simulator build was started but did not produce a completed workload trace during this audit. Android has no connected device/emulator.

Validation gaps / prohibited claims: no measured latency, FPS/jank, memory, battery, thermal, native allocation, release startup, or field-prevalence claims. Simulator evidence would not substitute for physical-device claims.

Source coverage: relevant app, feature, service, data, native, config, tooling, and workload-driver roots mapped in `file-inventory.csv`; generated/build/worktree outputs excluded with reasons.

Workload coverage: 12 major workload families inventoried and end-to-end paths traced statically in `workloads.csv`.

Surface coverage: all mandatory surfaces dispositioned in `surface-matrix.csv`.

Measurement coverage: static disposition complete; runtime measurements blocked/not run. Commands and their status are in `run-log.csv`.

Platform/device coverage: Android/iOS paths accounted for; no physical device; no Android emulator connected; iOS simulator availability recorded but no completed audit workload trace.

Dataset coverage: schema-derived scaling axes recorded, but typical/large privacy-safe cardinalities are not calibrated from telemetry or product limits.

Lifecycle coverage: startup, warm resume, workplace switching, background stabilization, queues, caches, AI disposal, widgets, import/export, and repeated-cycle questions accounted for statically.

Material blockers: `blockers.md`.

Unresolved critical questions: which static risks cross a user-sensitive threshold on release builds and realistic data; whether export/import reaches memory pressure; whether simulation/reporting/reactive fan-out overlaps first interaction; and native AI/SMS memory/thermal behavior.

## Runtime architecture

`index.js` installs randomness, imports analytics/fonts, enters Expo Router, installs quick crypto on native, initializes Sentry, and prevents splash auto-hide. `RootLayout` constructs gesture/safe-area/error/database/UI/workplace/analytics/theme providers, bootstrap and foreground hooks, navigation, notifications, and splash orchestration.

Principal data path:

`workplace/account/journal/exchange-rate change → Watermelon/RxJS observers → debounced shared aggregate/read models → raw SQL/materialization → JS hierarchy/FX/wealth/report/simulation transforms → snapshots/replay caches → React screens/lists/charts/widgets`.

Writes flow through ledger/import/SMS services into Watermelon batches, rebuild queues, observer emissions, and downstream projections. Native boundaries include SQLite JSI, SMS, LiteRT, crypto, filesystem/zip, notifications, and widgets. Explicit cache disposal, workplace scoping, generation cancellation, debouncing, and queue coalescing are present; generic leak/bridge/list claims were rejected.

## Highest-leverage static risks

These are not measured performance findings. They are structurally established mechanisms worth measuring first.

### P-001 — Full export/import representations multiply peak memory

Priority: P1 (static risk)
Evidence: E2
Finding type: STATIC RISK
Affected workloads: W-009
Platforms/builds: Android/iOS/web source paths; runtime device/build unknown.
Dataset/cache/lifecycle conditions: total rows and serialized bytes across all workplace tables; export fetches all tables concurrently; import reads full file/buffers.

User consequence: not established. The deterministic risk is peak memory growing with the full dataset and multiple simultaneous representations; no OOM, freeze, or duration claim is made.

Evidence: `nativeBackupExporter.ts:46-184` fetches all tables, transforms them, creates complete JSON, compresses it, and converts ZIP data to Base64 before cleanup. `exportSerialization.ts:34-47` builds the complete JSON string. Import orchestration reads the complete archive/buffer and may create extracted buffers/strings. Import chunking occurs after preparation and bounds DB batch size, not all preparation memory.

Runtime mechanism: file/export trigger → parallel table fetch → arrays/transformed arrays → JSON string → ZIP → Base64 → filesystem/share; import is the inverse with full representations → JS/native memory pressure.

Root cause: whole-dataset representation ownership is retained across stage boundaries instead of streaming or releasing earlier representations.

Scaling behavior: total rows `N`, largest table, JSON bytes, compression ratio, ZIP bytes, Base64 expansion, relationship fan-out; peak is structurally proportional to multiple representations of `N`.

Alternatives tested: raw SQL can reduce ORM model instantiation but does not eliminate aggregate arrays/JSON/ZIP/Base64; chunked database writes do not reduce prebuilt operation memory; no generic “SQLite is slow” claim.

Recommendation: measure first. If material, release stage inputs earlier and prefer file/stream/native compression APIs that avoid Base64/full duplicate strings, preserving backup atomicity and import rollback semantics.

Tradeoffs and correctness constraints: streaming/native APIs add complexity and must preserve workplace isolation, checksums, audit/rebuild semantics, rollback, share compatibility, and cancellation.

Verification protocol: synthetic deterministic export/import at justified empty/typical/large/stress shapes; same release-like build/device/cache state; record row counts, stage bytes, JS heap, process/native RSS, duration, frame behavior, and correctness/rollback. Compare distributions.

Confidence limits: no calibrated dataset, memory trace, device evidence, or user prevalence.

### P-002 — Shared aggregate emissions fan out full-workplace work and synchronous snapshots

Priority: P1 (static risk)
Evidence: E2
Finding type: STATIC RISK
Affected workloads: W-001 W-003 W-004 W-005 W-006 W-012
Platforms/builds: all source platforms; runtime magnitude unknown.
Dataset/cache/lifecycle conditions: account count `A`, journal metadata count `J`, active transaction count, exchange-rate changes, accepted emission frequency after debounce, subscriber count `D`.

User consequence: not established. An accepted emission deterministically triggers raw balance metrics, mapping, precision lookup, hierarchy aggregation, wealth conversion, and synchronous snapshot persistence before downstream consumers receive data.

Evidence: `reactiveAggregatedBalances.ts:73-156` combines four sources, debounces/distincts, runs raw SQL, maps balances, builds precision maps, aggregates hierarchy, calculates wealth, and calls `saveWealthSnapshot`. `ReactiveDataService.ts:126-213` derives dashboard/account-list payloads and saves snapshots. `ReactiveDataService.ts:230-277` exposes account-detail consumers. `JournalObserveQueries.ts:107-111` observes all non-deleted workplace journal metadata.

Runtime mechanism: mutation/source emission → aggregate SQL/materialization → JS transforms → synchronous MMKV JSON → replay stream → dashboard/accounts/details consumers → render/commit.

Root cause: broad source invalidation and full-workplace derived payload ownership shared across multiple UI consumers.

Scaling behavior: `O(A)` accounts, `O(J)` journal metadata, current-period rows, map/array materialization, snapshot bytes, emission frequency, and downstream fan-out `D`. Debounce reduces frequency, not per-emission cardinality.

Alternatives tested: debounce/distinct/replay/disposal are real controls; they do not prove accepted emissions are cheap. No claim that every emission causes material React work or that SQL itself is the bottleneck.

Recommendation: instrument rows/emissions/subscribers and phase durations. If material, narrow observers/read models by screen and mutation type; coalesce snapshot persistence off the critical path with bounded latest-value semantics while preserving freshness.

Tradeoffs and correctness constraints: narrower invalidation must not stale balances or violate workplace isolation; deferred snapshots can weaken instant-boot freshness; cache bounds and disposal remain required.

Verification protocol: synthetic mutation traces at calibrated `A/J` shapes; compare source emissions, SQL/rows, materialization, transform, stringify/MMKV, React commit, and visible result with/without snapshot tap isolation.

Confidence limits: no emission count, subscriber count, duration, React profile, or release/device result.

### P-003 — Safe-to-Spend simulation retains horizon-sized account maps and multiplies projection work

Priority: P1 (static risk)
Evidence: E2
Finding type: STATIC RISK
Affected workloads: W-003 W-008
Platforms/builds: Android/iOS source paths; runtime/device unknown.
Dataset/cache/lifecycle conditions: simulation days `D`, accounts `A`, budgets `B`, scopes `S`, cycles `C`, planned recurrence density, liabilities, and reactive emissions.

User consequence: not established. The path retains one cloned account-balance map per simulation day and regenerates the pipeline when inputs emit.

Evidence: `Simulator.ts:66-115` emits daily projections and clones `roundedAccountBalances` into each result. `BudgetFlowGenerator.ts:38-153` allocates day-sized burns and loops budget cycles, eligible days, and target accounts. Safe-to-Spend input acquisition creates per-budget usage observers in `safeToSpendInputAcquisition.ts:161-167`; the read model can be prewarmed and consumed by widgets.

Runtime mechanism: source/budget/planned/account emission → input acquisition → flow generators → daily simulator → projections/maps → dashboard/widget/read-model consumers.

Root cause: projection representation retains horizon-wide account state while independently expanding budget/recurrence flows.

Scaling behavior: map retention `O(D×A)` plus budget/scope/cycle/recurrence/liability work and emission frequency; exact constants and thresholds unknown.

Alternatives tested: shared cache and prewarm reduce duplicate subscriptions; no proof that the simulator is slow or that all input emissions reach React.

Recommendation: profile phase counts/bytes first. If material, reduce retained projection state to consumer-required fields/horizon, memoize stable inputs at the read-model boundary, or incrementally recompute invalidated projections without weakening financial correctness.

Tradeoffs and correctness constraints: incremental/cached financial projections risk stale/incorrect balances; changes require scenario correctness tests, workplace scoping, and snapshot/widget verification.

Verification protocol: deterministic seeds with `D=30/90/180` and justified `A/B/S/C`; record flow counts, retained map entries, heap peak, phase duration, emissions, render/commit, and output equality.

Confidence limits: simulation shapes and runtime memory/duration are unmeasured.

### P-004 — Uncapped bulk-entry rows and continuous UI-to-JS update paths are boundedness risks

Priority: P2 (static risk)
Evidence: E2
Finding type: STATIC RISK
Affected workloads: W-004 W-006 W-007
Platforms/builds: all source platforms; release/device behavior unknown.
Dataset/cache/lifecycle conditions: bulk rows `N`, chart points `P`, series `S`, account-tree rows, gesture update rate, and edge auto-scroll duration.

User consequence: not established. Bulk entry maps all rows in a normal `ScrollView` with no visible cap; bar-chart scrolling sets React state every 16 ms and maps all SVG points/series; account-tree drag calls JS on every gesture update.

Evidence: `BulkEntryGrid.tsx:130-187` maps rows into `ScrollView`; `useBulkJournalEditor.ts:72-79` appends without a maximum and edits copy/scan the full row array. `BarChart.tsx:192-197` calls `setScrollX` at `scrollEventThrottle=16`, and `224-263` maps the full SVG. `AccountManagementTreeRow.tsx:63-69` invokes `runOnJS(onUpdate)` per gesture update; `useAccountTreeDragController.ts:133-260` computes hover/auto-scroll/state in JS.

Runtime mechanism: add/type/scroll/drag → full React/native row tree or SVG mapping / JS gesture callback → layout/commit/UI scheduling.

Root cause: user-controlled cardinality or display-rate events are coupled to broad React/native work.

Scaling behavior: bulk row count `N`, chart node count approximately `P×S`, gesture rate and hierarchy rows/auto-scroll duration.

Alternatives tested: ordinary bounded ScrollViews and list callbacks were rejected; FlashList/SectionList paths have pagination/windowing; Reanimated transforms may keep motion smooth but do not remove JS hover work.

Recommendation: measure first. Candidate interventions are virtualization/capping for bulk entry, UI-runtime/native sampling for chart scrub, and reducing `runOnJS` frequency or moving hover geometry off JS. Do not add memoization by checklist.

Tradeoffs and correctness constraints: virtualization affects keyboard/focus/accessibility; chart sampling can reduce tooltip fidelity; gesture changes must preserve drop-target correctness and auto-scroll.

Verification protocol: release Hermes Android/iOS at rows 10/50/100/250, charts 30/90/180 points and 1/2 series, tree 20/100/300 rows with/without edge-scroll; record input-to-visible, JS commits/long tasks, UI frames, memory, gesture hover latency, and output correctness.

Confidence limits: no frame/input/commit/memory measurements.

## Additional open hypotheses

- Startup stabilization concurrently launches integrity, insight, planned-payment, sharing, exchange-rate, notification, and optional SMS work after delay; overlap with resume/first interaction is unknown (`H-008`, `H-014`).
- Cold-start module/font evaluation is broad; module evaluation and selected-font load are unmeasured (`H-004` and the UI memo UI-04).
- Reporting can load aggregate queries plus a full transaction range and convert rows (`H-017`); SMS can return full bodies, parse concurrently, and issue duplicate/rule work (`H-018`).
- LiteRT models range from hundreds of MB to multiple GB and can run up to three passes (`H-016`); model memory/thermal lifecycle is device-blocked.
- Rebuild queue, widget sync, model switching, network timeout/cancellation, and lifecycle retention remain open questions, not findings.

## Rejected hypotheses

See `rejected-hypotheses.md`: generic ScrollView/memo/list callback claims, generic Watermelon leak claims, raw-SQL universal claims, unbounded widget/rebuild claims, and build-time asset generation as runtime startup cost.

## Optimization sequence

1. Establish synthetic dataset cardinalities and a release-like measurement harness.
2. Measure export/import memory first because the representation-growth proof is strongest.
3. Measure shared aggregate emission → snapshot → render fan-out.
4. Measure Safe-to-Spend projection phase cost and retained state.
5. Measure bulk/chart/tree UI paths and startup stabilization/module evaluation.
6. Measure native AI/SMS/widget/model lifecycle on physical devices.

Do not implement changes from this static audit until a discriminating baseline exists, except temporary audit-only instrumentation that is removed afterward.

## Verification plan

Every future optimization must compare the same commit family, platform/device, release-like build, dataset seed, cache/lifecycle state, workload script, and instrumentation. Record raw runs, median/spread, failures, correctness, memory/battery tradeoffs, and trace shape in `run-log.csv`. Add workload-specific budgets only after credible baselines exist.

## Coverage handoff

Durable ledgers: `file-inventory.csv`, `workloads.csv`, `surface-matrix.csv`, `hypotheses.csv`, `run-log.csv`, `findings.md`, `rejected-hypotheses.md`, `blockers.md`, and `coverage.md`. Specialist memos and the UI source memo are preserved in `specialist-memos.md` and `docs/audits/ui-performance-memo-2026-08-25.md`.
