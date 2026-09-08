# Architecture Safety Remediation Plan

Status: implemented; verification complete

Verdict: Fixable. These are three boundary failures, not a reason to redesign the application.

## Objective

Close three specific escape hatches:

1. Safe-to-Spend must reject invalid numeric input before `NaN` can enter a projection.
2. A production build must not be able to run the E2E reset or seed path.
3. Shared production code must not import feature implementation code.

Deliver them as three independent patches. Do not combine them with the broader journal,
simulation, or database redesign ideas from the architecture audit.

## Scope challenge

The smallest sufficient solution is:

- one numeric validation boundary at the simulation entry point;
- one build-time E2E capability gate, repeated immediately before destructive E2E work;
- one enforceable shared-to-feature dependency rule, plus removal of the current violations.

This plan deliberately does not add a service layer, rewrite the simulation model, split the
Journal feature, or broaden the database-access rules. Those changes have different risk and
should not hide inside safety fixes.

## What already exists

| Area | Existing mechanism | Gap |
| --- | --- | --- |
| Simulation | Flow invariants reject negative amounts; `SafeToSpendReadModel` catches simulation errors | `NaN` and infinity pass the amount check; starting balances and time inputs are not validated |
| E2E | Launch arguments require `e2eAuth`; E2E seed code is dynamically imported | The token works even when the app was not built for E2E; the destructive seed function has no local guard |
| Dependencies | `check-feature-boundaries.mjs` guards feature-to-feature imports and stale allowlist entries | It scans only `src/features`, so neutral modules can point into feature internals while CI stays green |

Current baseline evidence:

- `check:feature-boundaries` reports 14 approved feature edges and passes.
- `check:dependency-cycles` reports the existing three-cycle baseline and passes.
- The passing feature check is a false sense of safety for neutral code because it never scans the
  neutral roots.

## Target boundaries

```text
financial inputs
      |
      v
simulation input invariants
      |
      +-- invalid -> throw -> read model fallback, no snapshot write
      |
      `-- valid -> Simulator -> finite projection
```

```text
production build                         E2E build
EXPO_PUBLIC_E2E != 1                     EXPO_PUBLIC_E2E == 1
        |                                        |
        v                                        v
bootstrap branch removed/disabled        launch token required
                                                 |
                                                 v
                                      destructive guard rechecks build
```

```text
app/routes -> features -> shared production modules -> services/data
                   X                     |
                   `---------------------'
                  shared must never import a feature
```

## Workstream 1: Make simulation numeric input fail closed

### Decision

`Simulator.simulate` is the trust boundary. Every caller, including tests and future callers that
bypass flow generators, receives the same protection.

Invalid data must throw before balances are copied, flows are grouped, or projections are built.
The existing read model catches that failure and returns its empty dashboard fallback. The snapshot
writer must not persist a result from the failed run.

### Changes

1. Add `SimulationInputInvariants.ts` under `src/services/simulation/utils`.
2. Add one function that validates:
   - every starting balance is finite;
   - `days` is a finite, non-negative integer;
   - `startDayOffset` is a finite integer;
   - `startDayTimestamp` is finite;
   - every flow passes the existing hard structural invariants.
3. Strengthen `assertHardInvariants` so `amount` is finite and non-negative and `dayOffset` is a
   finite integer before timeframe comparisons run.
4. Call the new simulation-input assertion as the first operation in `Simulator.simulate`.
5. Remove the private negative-amount check from `Simulator.applyFlow` after the entry assertion is
   in place. There should be one rule implementation, not two messages for the same invariant.
6. Keep generator calls to `assertValidFlow`. They provide earlier diagnostics and reuse the same
   hard-invariant function, so they do not create a second rule definition.

Primary files:

- `src/services/simulation/Simulator.ts`
- `src/services/simulation/utils/FlowInvariants.ts`
- new `src/services/simulation/utils/SimulationInputInvariants.ts`
- simulation tests under `src/services/simulation/**/__tests__`

### Tests

- Replace the current test that expects `NaN` propagation with rejection tests.
- Cover `NaN`, positive infinity, and negative infinity for:
  - flow amount;
  - flow day offset;
  - starting balance;
  - simulation duration;
  - start offset;
  - start timestamp.
- Cover fractional `days` and fractional `dayOffset`.
- Preserve zero amounts, negative starting balances, past flows, and valid transfers as legal where
  their current domain rules allow them.
- Add a read-model test proving invalid simulation input returns the fallback and does not call the
  snapshot writer.
- Re-run projection snapshot tests to prove valid outputs are unchanged.

### Exit criteria

- No public simulation result contains `NaN` or infinity for any tested invalid numeric input.
- Validation happens before the first mutation or projection allocation.
- Valid projection snapshots do not change.
- The failure path logs once, returns the existing safe fallback, and writes no snapshot.

### Cost

Runtime cost is one linear pass over starting balances and flows before simulation:
`O(accounts + flows)`. The simulation already traverses both collections, so this is bounded and
small relative to the projection loop.

## Workstream 2: Make the E2E reset path build-capability gated

### Decision

The launch token is not a security boundary. It is a request parameter embedded in source. The
real capability must be granted when the test binary is built.

Use two independent gates:

1. a static build flag that allows production minification to remove the bootstrap import path;
2. a runtime assertion directly inside the destructive seed/reset function.

Both the build flag and the existing launch token must be present in an E2E binary. A normal
production build must ignore valid-looking E2E launch arguments.

### Changes

1. Add `src/testing/e2eRuntimeGate.ts` with:
   - `isE2eHarnessEnabled()` requiring both `process.env.EXPO_PUBLIC_E2E === '1'` and
     `Constants.expoConfig.extra.e2eHarnessEnabled === true`;
   - `assertE2eHarnessEnabled()` for mutation boundaries.
2. In `AppReadyProvider`, put the entire dynamic import behind the direct static
   `process.env.EXPO_PUBLIC_E2E === '1'` condition. Remove the static import of
   `e2eLaunchArgs` from normal startup.
3. Make `readE2eLaunchConfig()` return `null` before reading launch arguments unless the build gate
   is enabled.
4. Recheck `assertE2eHarnessEnabled()` at the start of `executeE2eBootstrap`, before storage clear,
   database reset, backup import, or seed writes.
5. Keep the current auth token as the second gate for enabled test builds. Rename comments that
   imply the token alone protects production.
6. Set `EXPO_PUBLIC_E2E: '0'` explicitly in the EAS production profile. Detox release builds keep
   setting it to `1` explicitly.
7. Add a release-only bundle check:
   - export the app with the production variant and E2E disabled;
   - scan emitted JavaScript for a stable destructive-bootstrap marker;
   - fail if the E2E seed/reset module is present;
   - run this in CI or the release workflow, not in the fast architecture check.

Expo statically replaces `EXPO_PUBLIC_*` references in application code during bundling, which is
why the direct condition is required at the dynamic-import site. The flag is capability selection,
not a secret.

Primary files:

- `src/contexts/app-shell/AppReadyProvider.tsx`
- `src/testing/e2eLaunchArgs.ts`
- `src/testing/e2eBootstrap.ts`
- `src/testing/e2eSeed.ts`
- new `src/testing/e2eRuntimeGate.ts`
- `app.config.ts`
- `eas.json`
- `.detoxrc.js`
- `package.json`
- `.github/workflows/ci.yml` or the release workflow that builds production artifacts

### Tests

- Production gate off plus a valid auth token returns no launch config.
- E2E gate on plus a missing or invalid token returns no launch config.
- E2E gate on plus a valid token parses reset and seed options.
- Calling `executeE2eBootstrap` with the gate off rejects before storage or database mocks are
  called.
- Calling it in an enabled E2E test preserves current reset and seed behavior.
- The production bundle check proves the destructive bootstrap marker is absent.
- The existing Detox smoke launch proves an E2E release binary can still reset and seed.

### Exit criteria

- A normal production binary ignores E2E launch arguments, even with the correct source token.
- The destructive function independently refuses to run when the build capability is absent.
- Production release output does not contain the destructive seed/reset module marker.
- Detox release tests still pass with the capability explicitly enabled.

### Failure handling

- If an E2E binary is built without the flag, it fails closed and does not seed. The Detox smoke
  test catches this configuration error.
- If production CI accidentally sets the flag, the explicit EAS production value and bundle check
  fail the release before distribution.

## Workstream 3: Enforce shared code independence from features

### Decision

Do not allow a baseline for the current violations. Move the genuinely reusable code to neutral
locations, then make the checker reject any future neutral-to-feature import.

The rule applies to production-neutral roots:

- `src/components`
- `src/constants`
- `src/contexts`
- `src/data`
- `src/design-system`
- `src/hooks`
- `src/services`
- `src/types`
- `src/utils`

`src/testing`, mocks, and test fixtures are excluded because they intentionally orchestrate
features. Feature-to-feature imports retain the existing public-barrel allowlist.

### Changes

#### A. Move account selection to its real shared home

Move the reusable account picker implementation from `src/features/accounts` into
`src/components/account-selection`:

- `AccountPickerModal.tsx`
- `AccountPickerList.tsx`
- `BaseAccountPickerModal.tsx`
- the picker list hook

Move the reusable archived-account presentation helper and `ShowArchivedButton` to the existing
neutral account-component area. Move the reactive account read hooks to `src/hooks/useAccounts.ts`.

Then:

- make `src/components/account-selection/index.ts` export only neutral files;
- make `src/features/accounts/index.ts` re-export the shared picker and account read hooks for
  compatibility with approved feature consumers;
- update Accounts-feature internal imports to the neutral files;
- preserve current component props and behavior during the move.

This removes the hidden Journal-to-Accounts dependency without introducing an Accounts-to-Journal
cycle.

#### B. Move amount-expression logic out of Journal

Move `amountExpression.ts` to `src/utils/amountExpression.ts`. Update the calculator overlay and
Journal tests/imports. The expression evaluator is generic input logic and has no Journal state.

#### C. Split the journal route contract from the Journal parser

Create a neutral route-contract module containing:

- `JournalEntryRouteEditorMode`;
- `JournalEntrySimpleType`;
- `TransactionIntentSeed` and its source context;
- legacy query parameter types;
- seed-to-query serialization used by navigation.

`src/utils/navigation.ts` imports this neutral contract and serializer. The Journal feature adapter
continues to own incoming route parsing and conversion into feature state. Presentation helpers
remain in the Journal feature.

This is a contract extraction, not a second navigation abstraction.

#### D. Strengthen the checker

Refactor `scripts/check-feature-boundaries.mjs` so its analysis is callable from tests and its CLI
behavior remains unchanged.

The checker must:

- preserve all current feature-to-feature public-barrel rules;
- reject deep cross-feature imports;
- reject every import from a production-neutral root into `@/src/features/*`;
- reject stale allowlist entries;
- report the source file and forbidden import;
- scan the full configured root list, not a sample.

Add fixture-based tests under `scripts/__tests__` for:

- neutral-to-feature import rejected;
- neutral-to-shared import accepted;
- feature-to-own-feature import accepted;
- approved cross-feature barrel import accepted;
- deep cross-feature import rejected;
- unapproved cross-feature edge rejected;
- stale allowlist edge rejected.

Primary files:

- `src/components/account-selection/**`
- `src/components/accounts/**`
- `src/hooks/useAccounts.ts`
- `src/features/accounts/**` import sites and compatibility barrel
- `src/utils/amountExpression.ts`
- `src/utils/navigation.ts`
- neutral journal route-contract module under `src/types` or `src/utils`
- `src/features/journal/entry/journalEntryRouteAdapter.ts`
- `scripts/check-feature-boundaries.mjs`
- new `scripts/__tests__/check-feature-boundaries.test.mjs`

### Tests

- Run the new checker unit tests and `check:feature-boundaries`.
- Run account picker, archive presentation, amount expression, navigation, and journal route adapter
  tests.
- Run typecheck to catch all moved import paths.
- Run dependency-cycle and architecture checks to ensure no replacement cycle or deep import appears.
- Run the Journal create/edit Detox smoke after the mechanical moves.

### Exit criteria

- `rg` finds no production-neutral import of `@/src/features/*`.
- The boundary checker fails on an intentionally introduced neutral-to-feature fixture.
- Existing approved feature edges still work and stale edges still fail.
- Account picker, calculator, and Journal navigation behavior is unchanged.
- The dependency-cycle baseline does not increase.

## Test coverage map

Legend: `[covered]` exists today, `[add]` is required by this plan.

```text
Simulation
├── valid finite projections [covered]
├── invalid flow amount [add]
│   ├── NaN
│   └── +/-Infinity
├── invalid starting balance [add]
├── invalid duration/offset/timestamp [add]
└── read-model fallback without snapshot write [add]

E2E safety
├── token missing [covered]
├── valid token parsing [covered, update for build gate]
├── valid token in production build [add]
├── destructive function called with gate off [add]
├── production bundle excludes reset module [add]
└── enabled Detox reset/seed smoke [covered, rerun]

Dependency boundaries
├── feature public-barrel allowlist [covered by CLI]
├── neutral-to-feature rejection [add]
├── deep cross-feature rejection [add unit coverage]
├── stale allowlist rejection [add unit coverage]
└── moved account/journal shared behavior [existing focused tests, rerun]
```

## Execution order and parallelization

The three workstreams can be implemented in parallel because their production file sets do not
overlap.

| Lane | Work | Depends on | Merge risk |
| --- | --- | --- | --- |
| A | Simulation numeric boundary | None | Low |
| B | E2E build and destructive-operation gates | None | Medium, because build and CI files change |
| C | Shared-code extraction and dependency checker | None | Medium, mostly import moves |
| Final | Full verification and release-bundle proof | A, B, C | Low |

Recommended landing order:

1. Simulation safety patch.
2. E2E production safety patch.
3. Shared-boundary patch.
4. One final verification-only pass. Do not hide fixes inside this pass.

Each patch should be independently revertible. No remote push is part of this plan.

## Verification commands

Focused checks first:

```text
simulation invariant and read-model tests
E2E launch/bootstrap unit tests
feature-boundary checker unit tests
account picker, amount expression, navigation, and route-adapter tests
```

Then repository checks:

```text
bun run check:feature-boundaries
bun run check:dependency-cycles
bun run check:architecture
bun run typecheck
bun run lint
bun run test:ci
production E2E-surface bundle check
Detox critical smoke specs
```

## Failure modes to watch

| Failure | Detection | Response |
| --- | --- | --- |
| Legitimate historical negative balance is rejected | Existing simulation snapshots fail | Validate finiteness, not balance sign |
| Fractional day behavior was accidentally relied on | Focused simulator tests fail | Treat it as invalid; a simulation day is discrete |
| Read model writes a stale/invalid snapshot after rejection | Snapshot-writer spy fails | Keep persistence downstream of successful projection only |
| E2E tests silently stop seeding | Detox smoke fails at launch | Fix build flag propagation; never weaken the production gate |
| Production bundle still contains the reset module | Bundle scan fails | Move the static condition closer to the dynamic import and inspect emitted chunks |
| Shared extraction creates a feature cycle | Cycle guard fails | Keep picker contracts and hooks neutral; do not point Journal at Accounts barrel |
| Checker causes false positives in test orchestration | Checker fixture fails | Keep `src/testing`, mocks, and test fixtures explicitly excluded |
| Mechanical moves change UI behavior | Focused component and Detox tests fail | Preserve public props and re-export compatibility during the move |

## Not in scope

- Replacing the simulation engine or changing Safe-to-Spend business rules.
- Adding an error-state redesign to the dashboard.
- Moving all database access behind services.
- Splitting Journal into new packages or subfeatures.
- Removing the existing three dependency-cycle baselines unless this work naturally removes one.
- Renaming feature terminology or reorganizing unrelated files.
- Fixing every architecture-audit finding in the same branch.

## Review log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-09-08 | Keep scope to three independent fixes | Each has a distinct trust boundary and test strategy |
| 2026-09-08 | Reject invalid simulation input instead of coercing it | Coercion hides corrupted financial data |
| 2026-09-08 | Treat E2E token as a request, not a capability | The token is present in client source and cannot protect production |
| 2026-09-08 | Fix current neutral-to-feature imports without a baseline | A baseline would legitimize the exact dependency leak being closed |
| 2026-09-08 | No new service classes | Functions and existing boundaries are sufficient |

## Readiness dashboard

| Dimension | Status |
| --- | --- |
| Scope | Locked |
| Architecture ownership | One owner identified for each boundary |
| Data flow | Traced through simulation, startup/bootstrap, and imports |
| Edge cases | Enumerated in tests and failure table |
| Performance | Bounded; only simulation adds a linear preflight pass |
| Rollback | Three independently revertible patches |
| Test plan | Complete |
| Open product decisions | None |

No `TODOS.md` entries are proposed. Deferred audit findings remain outside this plan rather than
being converted into vague follow-up debt.

## Review completion summary

- Step 0, Scope Challenge: scope reduced to the three requested boundary fixes; broader cleanup
  excluded.
- Architecture Review: 3 boundary ownership failures addressed in the plan.
- Code Quality Review: no new class or service required; duplicate rule definitions and misleading
  E2E-token comments are removed as part of the fixes.
- Test Review: coverage map produced; 12 missing cases grouped into focused unit, bundle, and E2E
  checks.
- Performance Review: 1 bounded cost identified, the linear simulation input preflight.
- NOT in scope: written.
- What already exists: written.
- `TODOS.md` updates: 0 proposed.
- Failure modes: 0 unresolved critical gaps after the planned controls and tests.
- Outside voice: skipped because this is a bounded internal safety remediation.
- Parallelization: 3 independent lanes, followed by 1 sequential verification pass.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
| --- | --- | --- | ---: | --- | --- |
| CEO Review | `/plan-ceo-review` | Scope and strategy | 0 | Not run | Not required for bounded internal safety fixes |
| Codex Review | `/codex review` | Independent second opinion | 0 | Not run | Optional after implementation |
| Eng Review | `/plan-eng-review` | Architecture and tests | 1 | Clear | 3 issues, 0 unresolved critical gaps |
| Design Review | `/plan-design-review` | UI and UX gaps | 0 | Not run | No UI change planned |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | Not run | No public developer workflow change planned |
