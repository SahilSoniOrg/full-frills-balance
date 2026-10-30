# Startup simulation on Worklets

Implemented, with production activation gated on a release-device comparison.
No device performance improvement has been measured yet.

## Execution boundary

The dashboard's balance simulation runs on one lazy `finance-simulation` Worker
Runtime in native development builds. Database acquisition, FX resolution,
recurrence/flow generation, report construction and React rendering retain their
existing execution paths. This is JavaScript on a separate native-managed thread,
not a rewrite of financial logic in Swift or Kotlin.

`balanceSimulation.ts` contains the single financial algorithm. The synchronous
`Simulator` facade and web executor call the same function. Draft/setup callers
keep their synchronous API. The native executor uses `runOnRuntimeAsync`; it
never uses the UI runtime or synchronous cross-runtime dispatch.

Inputs contain generated plain flows, Maps/Sets of IDs and balances, and explicit
numeric configuration. No Watermelon models, converters, trace objects or services
cross the boundary. The installed Worklets 0.13 serializer supports Maps/Sets,
so the result retains its existing representation and quiet-day snapshot sharing.
The entire helper graph is workletized, including rounding and validation.
Helpers precede callers because transformed worklets capture dependencies during
initialization; source-level function hoisting cannot be relied upon.

## Activation and rollback

`EXPO_PUBLIC_BACKGROUND_SIMULATION` is an Expo build-time variable:

- Unset: worker in native development; local calculation in production.
- `1`: worker in native development and production, for release-device validation.
- `0`: local calculation, including development, for an A/B baseline.

Restart Metro after changing the value; rebundle/rebuild release builds. Web always
uses the local calculation. No new native dependency or Babel configuration change
is needed: the installed Reanimated plugin already forwards to the Worklets plugin.
Bundle Mode was not enabled.

Worker errors propagate through the existing unavailable/stale forecast handling.
There is no hidden retry on the React Native runtime. The build flag is the explicit
rollback mechanism.

## Lifecycle

The dashboard worker runner retains at most one running request and one latest
pending request. A newer pending request rejects the superseded pending caller.
An AbortSignal removes queued work and immediately rejects an active caller, but
the worker slot remains occupied until the actual calculation finishes. Native
synchronous CPU work already in progress is not forcibly interrupted.

SafeToSpendReadModel now aborts projection work on RxJS switch/unsubscription.
Cancellation is checked after acquisition stages and worker completion. Cancelled
forecasts cannot continue into history/report processing or persist old snapshots.
Workplace/currency changes invalidate the owning subscription; no global revision
registry or duplicated financial engine is needed.

## Other startup changes

The result currency is no longer fetched just to convert it to itself, both in
input acquisition and CashFlowSimulationService. Foreign-currency rates retain
their existing resolution and missing-rate behavior. Background FX refresh still
runs independently, so this is not a complete removal of startup network activity.

The earlier blanket sequential startup queue has been replaced. Sharing, reminders,
SMS setup and legacy file cleanup start independently at idle opportunities. Heavy
maintenance tasks execute sequentially with an idle yield between tasks, before
optional FX/account/insight cache warming. An FX wait cannot prevent reminders or
due-payment processing from starting. This does not offload those maintenance tasks
or preempt an individual long task. Existing running native/I/O operations may finish
after cancellation; further startup tasks are suppressed.

## Validation

The existing simulator, cash-flow scenarios, draft precision and read-model suites
pass after extraction. New runner checks cover coalescing, cancellation, slot ownership
and recovery from errors. Executor checks cover lazy runtime reuse, local/web behavior,
production gating and error propagation.

`scripts/__tests__/simulation-worklet.test.mjs` compiles the real source using the
app's Babel configuration with a release Android Metro caller. It rebuilds every
captured worklet from serialized code in an isolated VM realm, rejecting captured
ordinary functions or class instances. It checks transfers, liability-directed flows,
cascade spending, decimal precisions 0/2/3, invariant errors, input immutability and
quiet-day snapshot sharing. This catches cross-runtime dependency mistakes that a
Jest native-module mock cannot catch. It does not exercise the C++ serializer or
Hermes worker runtime on a device.

Useful commands:

```sh
node --test scripts/__tests__/simulation-worklet.test.mjs
bun run test -- --runInBand src/services/simulation/__tests__ src/services/simulation/utils/__tests__ src/features/app/hooks/__tests__/useAppBootstrap.test.ts
bun run typecheck
```

## Release-device adoption gate

Use the affected device and representative small/large workplaces. Compare cold
launches with the flag set to 0 and 1, immediately navigating and scrolling after
launch. Include rapid refreshes, currency/workplace switches, and slow/offline FX.
Keep all financial data on the device.

Record `Simulation.WorkerInit`, `Simulation.WorkerCompute`,
`Simulation.WorkerRoundTrip` and `Simulation.LocalCompute`. Worker round trip includes
runtime initialization on the cold call and transfer/scheduling/return overhead;
it excludes waiting in the runner's pending slot. These metrics contain timings
only. Existing Trace stage metrics are cumulative, not separate stage durations.

Use the native profiler to measure JS long tasks and interaction latency as well
as total forecast readiness. A faster worker calculation alone is not sufficient:
input/result serialization and React updates still consume RN runtime time. Enable
production by default only after native serialization correctness and interaction
improvement are demonstrated. If acquisition or flow generation dominates, this
migration alone will not resolve the startup stall.

## Sources

- https://docs.swmansion.com/react-native-worklets/docs/threading/runOnRuntimeAsync/
- https://docs.swmansion.com/react-native-worklets/docs/threading/createWorkletRuntime/
- Installed node_modules/react-native-worklets/src/runtimes.native.ts
- Installed node_modules/react-native-worklets/src/memory/serializable.native.ts
- src/data/database/adapter.native.ts (JSI enabled; this alone does not establish query thread behavior)
