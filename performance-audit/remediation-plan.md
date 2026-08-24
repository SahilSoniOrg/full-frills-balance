# Performance remediation plan

Status: execution in progress. P-001, P-002, and the safe subset of P-004 are implemented on `main`; P-003 and bulk-entry virtualization remain unimplemented pending discriminating runtime evidence.

Scope: P-001 through P-004 in [`report.md`](./report.md). The audit is L0 static; every implementation step is gated by a reproducible baseline. Do not optimize from source shape alone. P-003 is currently P2, not P1, until realistic horizons/cardinalities or runtime evidence justify escalation.

## Execution record — 2026-08-25

- `fcf4531a perf: bound export table retention` — P-001 export tables now load and serialize sequentially, preserving the public export keys and ZIP/Base64 contract. Import was not changed because existing repository writes are already chunked and no bounded parser baseline exists.
- `1c76f40c perf: defer reactive snapshot persistence` — P-002 dashboard, account-list, and wealth snapshot writes are coalesced per workplace/key and deferred one event-loop turn; direct reads and synchronous save APIs remain intact; clear cancels pending writes.
- `45a852d5 perf: reduce chart and drag rerender pressure` — P-004 chart SVG is isolated from scroll-only tooltip state; account-tree gesture updates are coalesced below a 4px movement threshold. Bulk entry was intentionally left unchanged.
- Verification: focused functional tests passed (32 tests), `bun run typecheck` passed, `bun run lint` passed, and `bun run test:ci` passed (275 suites, 1659 passed, 1 skipped). Narrow coverage runs can fail repository per-file thresholds even when all selected tests pass; the full CI coverage gate passed.
- iOS validation ceiling: no completed physical-device trace. The iPhone 17 simulator build was attempted but no release workload trace was completed, so runtime magnitude and frame/memory claims remain unverified.
- iOS smoke validation: the Release iPhone 17 simulator build completed successfully and the seeded dashboard launch smoke test passed (1 suite, 1 test). This validates native integration and launch correctness only; it is not a performance profile.

## Operating rules

- Use one worktree per remediation stream: export/import, reactive data, simulation, and UI.
- Keep audit instrumentation separate from product changes and remove it after evidence is captured.
- Every stream must preserve financial correctness, workplace isolation, offline behavior, cancellation, accessibility, and snapshot freshness.
- Land only changes whose target metric improves beyond observed noise and whose correctness/resource checks pass.
- Squash each reviewed stream into `main`; do not push.

## Phase 0 — Baseline and harness

Owner: orchestrator + measurement worker. Commit: `perf: add audit workload harness`.

Before changing product code, add temporary or audit-only instrumentation for:

- export/import stage bytes, row counts, heap/RSS, duration, and cleanup;
- reactive source emissions, query/materialization/transform/snapshot durations, payload bytes, and subscriber count;
- Safe-to-Spend phase durations, flow counts, projection count, retained map entries, and heap;
- bulk-row input latency, chart JS commits/long tasks, tree `runOnJS` rate, UI frame deadlines, and memory.

Create deterministic synthetic seeds with documented shapes:

- empty, typical, large, and stress ledger/account/workplace datasets;
- bulk rows 10/50/100/250;
- chart points 30/90/180 with 1/2 series;
- account trees 20/100/300 rows;
- simulation horizons 30/90/180 with justified account/budget/scope cardinalities.

Run discovery and release-like lanes separately. Record raw runs in `run-log.csv`; use median and spread, never one timing. Stop or reorder if a baseline cannot change an implementation decision.

Exit gate: all four risks have before measurements, correctness snapshots, and a named device/build/dataset condition. If runtime access remains blocked, keep the plan and static findings; do not implement speculative fixes.

## Stream A — P-001 export/import memory

Owner: persistence/export worker. Primary paths: `src/services/export/nativeBackupExporter.ts`, `src/services/export/exportSerialization.ts`, import orchestration/repository paths.

### Preferred design

1. Preserve the current export contract and atomic backup semantics.
2. Replace the all-tables `Promise.all` retention with bounded table sequencing or bounded concurrency.
3. Serialize/write each table or streamable archive entry while releasing fetched/transformed arrays as soon as the entry is committed.
4. Avoid converting the final archive to Base64 when a file URI/native share path is accepted; retain a compatibility fallback only where required.
5. For import, parse/validate in bounded chunks and build DB operations per chunk rather than preparing the entire operation set first.

### Required checks

- Export bytes and imported row equality per table.
- Workplace isolation, checksum/rollback, cancellation, share compatibility, and retry behavior.
- Peak JS heap and process/native RSS at each dataset class.
- Frame behavior while the export/import progress UI is visible.

Success gate: lower peak memory or representation count without correctness regression; do not claim improvement until the same dataset/device/build comparison is outside noise.

Suggested commits:

- `perf: instrument export and import memory stages`
- `perf: bound export representations`
- `perf: chunk import preparation`

## Stream B — P-002 reactive fan-out and snapshots

Owner: reactive-data worker. Primary paths: `reactiveAggregatedBalances.ts`, `ReactiveDataService.ts`, snapshot service, cache coordinator, journal observers.

### Preferred design

1. Measure which source changes actually require aggregate balances, account-list data, dashboard journals, and account-detail data.
2. Narrow invalidation at the source/read-model boundary before adding memoization downstream.
3. Keep one shared aggregate computation where consumers genuinely need identical data; split unrelated dashboard journal enrichment from account balance recomputation.
4. Move snapshot persistence behind a bounded latest-value queue or idle/deferred boundary, with explicit workplace keying and a freshness marker.
5. Keep replay cache disposal and workplace switching behavior unchanged unless a lifecycle test proves a safer ownership change.

### Required checks

- Mutation-to-visible-result correctness for journal, account, exchange-rate, and bulk writes.
- Emission count, query count, payload bytes, stringify/MMKV duration, React commit duration, and first fresh-data latency.
- Cold boot from snapshot followed by fresh-data convergence.
- Workplace switching and repeated mount/unmount cycles without stale data or duplicate subscriptions.

Success gate: reduce accepted broad emissions or synchronous snapshot time while preserving fresh balances and instant-boot correctness.

Suggested commits:

- `perf: instrument reactive fan-out and snapshot cost`
- `perf: narrow reactive invalidation boundaries`
- `perf: defer bounded snapshot persistence`

## Stream C — P-003 Safe-to-Spend simulation

Owner: projection/simulation worker. Primary paths: `Simulator.ts`, `BudgetFlowGenerator.ts`, Safe-to-Spend read model/input acquisition.

### Preferred design

1. Confirm whether all consumers require a full account map for every simulation day. If not, retain only required fields or changed-account deltas.
2. Reuse immutable baseline inputs and avoid cloning unchanged account state when the consumer can resolve deltas.
3. Memoize or incrementally recompute at the read-model boundary when only one source changes; do not cache financial outputs without explicit invalidation.
4. Keep a full-result compatibility adapter initially so widget/dashboard projections can be compared byte-for-byte.

### Required checks

- Exact output equality against existing heavy simulation tests across recurrence, budgets, liabilities, currencies, and workplace scopes.
- Projection count, retained map entries, heap peak, phase durations, and emission-to-visible latency.
- Horizons 30/90/180 and account/budget/scope cardinality sweeps.
- Snapshot/widget output and cancellation during workplace switch/background.

Success gate: lower retained state or recomputation cost with identical financial outputs and no stale projection window.

Suggested commits:

- `perf: instrument Safe-to-Spend projection phases`
- `perf: reduce unchanged simulation state copies`
- `perf: add projection invalidation regression coverage`

## Stream D — P-004 UI update paths

Owner: UI worker, split into disjoint files.

### D1 Bulk entry

Paths: `BulkEntryGrid.tsx`, `useBulkJournalEditor.ts`.

Preferred order: first establish a product-safe maximum or virtualization requirement; then prototype virtualization in an isolated worktree. Preserve keyboard focus, auto-focus of the added row, validation, account/date pickers, and accessibility. Do not silently cap user input.

Measure mounted rows, input latency, JS commits, UI frames, and memory at 10/50/100/250 rows.

### D2 Bar chart

Paths: `BarChart.tsx` and chart interaction hooks.

Preferred order: keep scroll position on the UI/native side where possible; sample tooltip updates to meaningful index changes; avoid rebuilding all SVG nodes for a scroll-only update. Preserve tooltip accuracy and screen-reader/gesture behavior.

Measure 5-second fling JS work, React commits, UI frame deadlines, and tooltip latency at 30/90/180 points and 1/2 series.

### D3 Account-tree drag

Paths: `AccountManagementTreeRow.tsx`, `useAccountTreeDragController.ts`.

Preferred order: keep continuous geometry/hover calculations on the UI runtime or throttle `runOnJS` to target changes; keep final drop validation and mutation on JS. Preserve auto-scroll, hierarchy constraints, and cancellation.

Measure `runOnJS` calls, hover latency, JS occupancy, UI frames, and correctness at 20/100/300 rows with and without edge auto-scroll.

Suggested commits:

- `perf: instrument bulk entry and chart interactions`
- `perf: virtualize or bound bulk entry rows`
- `perf: decouple chart scrub rendering from scroll events`
- `perf: reduce account-tree gesture crossings`

## Review and merge sequence

1. Orchestrator reviews each worker diff against the baseline and rejects unrelated refactors.
2. Run focused correctness tests for the changed domain, then full typecheck/lint/test suite.
3. Run the same before/after workload matrix and append raw results.
4. Run the adversarial checks: stale snapshots, workplace switching, cancellation, accessibility, offline paths, import rollback, financial output equality, and lifecycle repetition.
5. Squash-merge only streams that pass their success gate into `main`; leave speculative streams unmerged with evidence in `hypotheses.csv`.

## Priority and stopping rule

Start with Stream A if memory instrumentation is available; otherwise Stream B because it has the broadest cross-workload fan-out. Do not implement all streams in parallel before measurement. A stream stops when its target cost is within noise, the workload is healthy at realistic scale, or the required runtime evidence is blocked. In those cases, record `REJECTED` or `BLOCKED` rather than forcing an optimization.
