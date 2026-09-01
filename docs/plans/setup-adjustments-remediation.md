# Setup Adjustments Remediation Plan

Status: safe behavior-preserving maintainability pass complete; resume/restore runtime screenshot follow-up remains

## Follow-up incident: category-selection crash

The category screen exposed two independent defects: sectioned two-column rows rendered children without React keys, and default selection objects included an `id` field that violated the strict Setup draft schema. Both were fixed in commit `40d68520`; the draft-shape regression is covered by `SetupDraftStore.test.ts`.

This plan captures the follow-up work from the setup-flow review. Correctness and recovery come before deletion or architectural cleanup.

## Scope

### 1. Regression coverage

- [x] Back from the first presented slice returns `at_start`.
- [x] Back from `create_workplace` exits the journey.
- [x] Auto-accepted device output runs `finishDeviceSetup`.
- [x] Imported appearance facts populate the appearance slice.
- [ ] Derived workplace names update when the display name changes.
- [x] Discard does not clear the draft after an uncertain workplace read.
- [x] Failed restore publication remains retryable.
- [ ] A blocking draft cannot be displaced by a route journey parameter.
- [ ] Custom account/category affordances are functional or absent.

### 2. Coordinator and draft state

- [x] Fix `back()` history handling at index zero.
- [x] Use one effect boundary for slice-completion side effects. `SetupJourneyScreen` owns the settle effect; coordinator transitions own persistence and checkpoint side effects.
- [x] Apply device finishing consistently for manual and auto-accepted outputs.
- [x] Move initial draft persistence out of render-time construction.
- [x] Mark derived workplace names as `defaulted` and recompute them when appropriate.

### 3. Restore correctness and recovery

- [x] Map valid imported appearance data into the draft.
- [x] Distinguish workplace absence from workplace-read failure.
- [x] Fail closed when discard cannot verify ownership or workplace state.
- [x] Expose retry/recovery after publication failure.
- [x] Preserve blocking drafts during journey resolution.
- [ ] Support source re-selection when a resumable restore source is unavailable. Deferred: requires a coordinator-level source replacement transition.
- [ ] Preserve preparation warnings through the restore pipeline. Deferred: the current parsed-import contract exposes no preparation warning field.
- [ ] Report publication progress where required by the product spec. Deferred: needs progress state in the setup screen, not just callback plumbing.

### 4. UI and progress

- [x] Render resolver-provided progress instead of hardcoded step numbers.
- [x] Wire or remove custom account/category actions.
- [ ] Replace deprecated onboarding vocabulary in setup test IDs and labels. Deferred cleanup.
- [ ] Keep outcome navigation at the coordinator/launch boundary where required by the ADRs. Deferred architecture follow-up.

### 5. Verification

- [x] Run focused setup unit/component tests: 10 suites, 56 tests passed.
- [x] Run typecheck and e2e typecheck.
- [x] Run architecture and boundary checks.
- [ ] Run the relevant first-run and restore e2e flows. First-run completed on the iPhone 17 simulator; resume/restore relaunch cases remain blocked by Detox synchronization before assertions.

### 6. Deferred cleanup

Only after behavior is green:

- [ ] Remove dead exports, routes, providers, and compatibility shims.
- [ ] Consolidate duplicated validators, parse guards, and summary verification UI.
- [ ] Remove unused coordinator options and parameters.
- [ ] Update stale specs, ADR references, and tests.

### 7. Behavior-preserving maintainability plan

This phase must not change the current setup behavior, navigation, copy, layout, safe-area behavior, progress presentation, or restore UX. Every structural change requires a before/after regression test or screenshot comparison.

#### 7.1 Freeze the contract first

- [x] Add focused component coverage for the current restore picker, restore summary, setup shell, and first-run-to-restore transition.
- [x] Add journey-level assertions for current step counts, auto-completion, Back behavior, draft resume behavior, and outcome navigation.
- [ ] Capture reference screenshots for name, restore picker, restore summary, appearance, and summary screens on the supported device profile.

#### 7.2 Restore draft ownership to the coordinator

- [x] Introduce a typed coordinator transition for switching from first-run name entry to restore.
- [x] Move restore draft construction, candidate-name preservation, operation ID creation, and persistence behind that transition.
- [x] Keep the screen responsible only for collecting the name and requesting the transition.
- [x] Verify interrupted transitions resume identically from the persisted draft.

#### 7.3 Make recipes authoritative

- [x] Represent workplace identity policy in recipe metadata instead of journey-ID checks in `SetupScreen`.
- [x] Preserve the current visible sequence and step counts for complete and partial backups.
- [x] Add resolver tests for every current journey, including incomplete imported workplace facts.

#### 7.4 Tighten type and effect boundaries

- [x] Replace coordinator-facing `NextSetupAction` output handling with a discriminated slice/output mapping. One localized generic-construction cast remains in the resolver.
- [x] Define one owner for device side effects: the coordinator commits them at the device checkpoint; terminal finishing no longer repeats the write. Appearance remains terminal-only by design.
- [x] Keep publication, verification, discard, and finish errors distinguishable at their canonical service boundary.

#### 7.5 Share presentation without changing UX

- [x] Extract the existing import plugin card presentation into a shared component used by settings and setup.
- [x] Preserve current card dimensions, icon treatment, button variants, copy, scrolling, bottom navigation, and loading behavior exactly.
- [x] Remove the ignored `RestoreSummarySlice.onBack` compatibility prop after updating callers and tests.

#### 7.6 Verification gate

- [x] Run typecheck, lint, and the full setup suite after each logical change.
- [x] Run the full repository test suite and architecture checks. Repository suite: 319 suites, 1,935 passed, 1 skipped; architecture checks passed.
- [ ] Re-run the supported device flows and compare reference screenshots. iOS release build succeeded and the corrected first-run setup Detox case passed on iPhone 17. Resume/restore cases still hit a Detox relaunch connection hang before assertions; no valid comparison screenshots were recorded for those cases.
- [ ] Stop and revert the individual change if any user-visible behavior or UX differs without explicit approval.

## Commit strategy

Use small logical commits: contract tests, coordinator ownership, recipe simplification, type/effect cleanup, shared presentation, and verification. Do not push. Preserve the current behavior/UX as the acceptance baseline.
