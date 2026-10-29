# Swipe navigation benchmark — 2026-10-29

Repeated work decreased. Uniformly smoother swiping and lower sustained memory are not established; Budget entry still has a visible loading cost.

## Experimental conditions

- iPhone 17 Daily simulator, iOS 26.4, shared arm64 Mac.
- Same Release native executable for both versions, embedded Hermes bytecode; every trace reports `__DEV__ = false`.
- Synthetic USD-only fixture: 21 accounts, 10,000 balanced posted journals, 20,000 postings, 20 budgets sharing identical scopes over 10 expense categories. This is an overlap stress case, not a representative-user claim.
- Baseline performance files restored from `f0860ae66c0e3ddc05143022fe5e6cb2f1971f49`; unrelated working changes held constant in isolated source copies.
- Three process runs per version, ordered baseline/changed/changed/baseline/baseline/changed. Restore the same fixture before each process restart; exclude import/seeding from the measured trace.
- Twelve 450 ms pans per run with 800 ms between gestures, across group chrome: Dashboard → Accounts → Budgets → Activity → Planned → Categories → Dashboard, twice. All six route sequences match.
- Analytics disabled and native widget writes stubbed equally. The daily app database was untouched.

## Results

Medians across three runs, with min–max in parentheses. Observer/conversion counts cover startup through the complete interaction sequence. Callback metrics cover the swipe window.

| Metric | Baseline | Changed |
| --- | ---: | ---: |
| Budget transaction observer factories invoked | 60 (60–60) | 22 (22–22) |
| Currency conversion calls, all instrumented callers | 310,000 (310,000–310,000) | 120,000 (120,000–120,000) |
| JS callback gaps over 100 ms per 12 pans | 10 (8–13) | 9 (8–10) |
| Longest JS callback gap in swipe window, ms | 883 (286–2,699) | 554 (549–565) |
| Per-run p95 JS callback gap, ms | 17.59 | 17.24 |
| RSS after two cycles, MiB | 512.9 (501.4–567.2) | 524.2 (461.5–543.3) |
| Budget data readiness after route entry, ms | 0; already prefetched | 589 (562–616), six entries |

Observer creation decreased 63.3%; conversion calls decreased 61.3%. Timing is noisier: the baseline maximum-gap spread is wide, the ordinary callback p95 barely changes, and warm RSS provides no consistent improvement. The new Budget-entry delay reflects deferred work; baseline prefetch was not free.

JS gaps come from identical `requestAnimationFrame` probes. They measure callback scheduling, not native dropped frames. Intervals crossing the measurement boundary are clipped to their overlap, excluding pre-swipe startup time. Host scheduling and identical instrumentation overhead can contribute. Budget readiness is a React effect after 20 non-loading rows exist, not a native-paint timestamp. RSS comes from simulator process snapshots and is not a device-footprint or leak finding.

Native FPS/hitch measurement was unavailable: the device tool requires a connected physical iOS device. No real-device smoothness or statistically established speedup is claimed.

## Calculation control and provenance

The actual original and changed calculation functions returned identical budget usage objects across six runs per version, using 20 budgets sharing 5,000 posting lines. Repository calls and currency conversion were doubles: account/journal lookups fell from 20 each to one each, and conversion calls from 100,000 to 5,000. This validates the synthetic calculation case; it excludes real SQLite, FX, and rendering. Its host timings ran during native compilation and are not app-speed evidence.

[Machine-readable evidence](swipe-navigation-benchmark-2026-10-29.json) retains all six per-run summaries, route sequences, the calculation control, fixture SHA-256, measured file/bundle hashes, and the native executable hash.

Measurements precede the commit-time correction that derives the paused `isLoadingMore` result from `enabled`, replacing a synchronous state update in the effect. The final committed tree was not re-benchmarked. Use the recorded hashes to identify the measured snapshot.

Full raw traces, command windows, synthetic fixture, isolated source preparation/driver/analysis scripts, and the longer report remain local in the ignored `artifacts/swipe-benchmark-20261029/` directory. They are not included in Git. `python3 artifacts/swipe-benchmark-20261029/analyze.py` regenerates the local result summaries. The driver requires the prepared release binary/bundles and session-specific device flags; it is not a portable CI benchmark.

One initial simulator attempt returned to onboarding after reinstall cleared its sandbox and was excluded. The corrected harness restored the fixture before every included run. The release build and calculation control passed. A prior repository-wide typecheck reported existing widget-copy, report test ID branding, and generated navigation-route errors outside the performance changes. No tests or benchmark runs were repeated while creating the commits.
