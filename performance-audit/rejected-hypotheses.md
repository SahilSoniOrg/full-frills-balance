# Rejected hypotheses

## Rejected or downgraded

- “Every `ScrollView` is a performance bug.” Bounded form/filter/modal surfaces are not findings; only the uncapped bulk-entry row path remains an E2 risk.
- “Every render callback or missing memo is a performance finding.” React Compiler is enabled and no render/commit cost was measured; retain no generic memoization claim.
- “Watermelon observers leak because subscriptions are not cleaned up.” `useObservable` cleanup and disposable replay ownership exist; retention remains unmeasured, not confirmed.
- “Startup background hydration blocks the first frame.” Static scheduling delays core work and uses generation cancellation; overlap remains a measurement target.
- “Raw SQL is universally faster.” JSI/native execution and ORM fallback require query/row/device measurement.
- “Rebuild queue is an unbounded leak.” Keys are coalesced and retries are bounded; foreground contention remains a hypothesis.
- “Widget updates are unbounded.” JS debounce and generation serialization bound accepted updates; native reload cost is unmeasured.
- “Build-time asset generation slows runtime.” `app.config.ts` asset generation is config/prebuild work, not installed-app startup.
- “Large AI models load at startup.” Model loading is use-triggered; model memory/thermal impact is still a native runtime blocker.

“Not measured” remains in `blockers.md` and `hypotheses.csv`, not here.
