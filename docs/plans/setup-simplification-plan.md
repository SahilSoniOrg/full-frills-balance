# Setup simplification plan

**Status:** Core architecture implemented; targeted cleanup and verification remain
**Date:** 2026-09-01
**Contract:** [`../specs/user-device-workplace/spec.md`](../specs/user-device-workplace/spec.md)
**Origin:** Thermo-nuclear review of Setup after `de897060`. The coordinator/recipe/restore seams are right; the UI still wraps old onboarding, the draft store re-parses import, and launch still has three gates.

This plan deletes extra concepts so the current code matches the parent contract. It is not a second Setup architecture.

## Problem

Setup already has a linear resolver, typed draft union, recipes, and restore publication. The implementation still:

1. Keeps `SetupScreen` as the onboarding god-component, with the coordinator as a sidecar.
2. Re-parses `RestoreFacts`, `ImportStats`, and workplace preferences inside `SetupDraftStore`.
3. Treats `device_onboarding`, `workplace_creation`, and `setup` as three UI modes.
4. Retains compatibility paths around restore (`clearSetupDraft` and `/import-selection`) that need a final consumer audit.
5. Injects keyed optional finishers and overlapping navigation flags (`editingSlice`).

## Solution

1. Draft store owns Setup identity only. Import owns restore fact/handoff parsing.
2. `SetupScreen` renders `coordinator.next()`.
3. Launch content sees `setup | picker | open`.
4. Restore uses the coordinator; obsolete post-import compatibility paths are removed only after their live consumers are verified.
5. Coordinator takes one `finish(draft)`. Three named finishers stay behind that call.

## Defaults

| Fork | Decision |
| --- | --- |
| Restore services | Keep `prepareRestore`, `publishRestore`, and publication claims. Wire them in phase E. |
| Launch kinds | Resolver may distinguish “no draft yet” from “resume blocking draft”. **UI has one Setup kind.** |
| Three finish functions | Keep `finishFirstRun` / `finishRestoreSetup` / `finishWorkplaceCreation`. Hide behind one coordinator `finish`. |
| Device written twice | First write on Device accept. Finisher repeat stays; it is intentional and idempotent. |
| `editingSlice` | Delete if `acceptedSlices` already contains `summary` covers Change → summary. Keep `activeSlice`. |
| Slice files | Yes. Flat under `features/setup`. No plugin registry. |
| Demo journal / replacement restore | Out of scope. |
| `/onboarding` URL | Keep. |
| Push | Do not push. Small logical commits on main (or squash-merge worktrees into main). |

## Verified remaining work

The core coordinator, recipe resolver, typed draft, restore preparation, restore summary, and
review-before-publication flow are already implemented. The remaining work is cleanup and targeted
verification, not a second architecture:

- The default Workplace name is still generated independently in
  `WorkplaceSetupSlice`; decide whether the contract requires deriving it from the accepted User
  display name.
- `publishRestore` accepts progress callbacks, but `setupRuntime` does not pass publication
  progress through to the Setup UI.
- Setup runtime/screen code still performs some direct `AppNavigation` calls; move terminal
  outcome ownership to the launch boundary if the contract remains authoritative.
- `AppOnboardingProvider`, `hasCompletedOnboarding`, and the `/import-selection` compatibility
  route still have consumers. Remove them only after distinguishing live compatibility from dead
  legacy state.
- Resume/interruption restore flows still need supported-device verification and reference
  screenshots.
- Explicit tests are still needed for replacing an unavailable resumable source and preserving
  preparation warnings, if those behaviors remain product requirements.

## Sequence

Each step leaves tests green and first-run completable.

### A — Delete accidental complexity (no user-visible change)

1. One draft key, one journey set, one projection. Launch keeps reading a blocking projection from `services/setup`. Setup store imports that key. Delete `projectBlockingSetupLaunch` if launch never calls it.
2. One finisher injection: `createSetupCoordinator({ finish })`. Map `draft.kind` to the three named finishers at the wiring site.
3. `applyOutput` uses `SetupSliceOutputById`. No duplicate first_run/restore casts.
4. Drop `editingSlice` if Change → summary still works via `acceptedSlices`.
5. One `restoreCore()` recipe. Four restore journeys share source → workplace → publish → restore_summary. Differences are entry policy and the first-run tail.
6. Stop re-parsing import in the draft store. Strict-parse Setup fields. `restore.facts` / `handoff` use import-owned parsers (or a shallow operationId/fingerprint check), not a closed-world `hasOnlyKeys` copy of `ImportStats` and workplace preferences.

### B — Device checkpoint leaves the screen

7. Device name + `deviceRegistered` write on Device accept, inside the checkpoint (blocking draft exists → validate → write name → register → persist accepted output).
8. Remove `finishDeviceSetup` from `SetupScreen.advance`. Keep the finisher repeat.

### C — Screen becomes a renderer

9. Device slice — splash + name state. `accept` / `back` only. No storage, no routing.
10. Workplace slice — identity/currency/accounts/categories stepper stays *inside* the slice. Coordinator still sees one `workplace` slice.
11. Appearance slice — local theme/font only; no preference writes until finish.
12. Setup summary slice — Change goes through `coordinator.edit`.
13. `SetupScreen` — load/create draft, construct coordinator, switch on `next()`. No form fields, no nested stepper, no Device writes, no `as` on `accept`.

Restore may still bail to legacy import until phase E. That is a temporary hole, not a new abstraction.

### D — One Setup gate in the shell

14. Resolver may still emit “start first-run” / “start workplace” when there is no blocking draft. Those are launch facts, not UI modes.
15. `LaunchCoordinator` maps them to a journey and ensures a blocking draft exists before render. Content only branches `setup | picker | open`.
16. Keep one isolated `legacy_post_import` compatibility branch until restore summary exists. Do not mix it into slice rendering.
17. Picker `onCreate` starts `create_workplace` via the coordinator, not `mode=full` as persisted progress.

### E — Wire restore or don’t claim it

18. Restore source slice — `prepareRestore`, persist source + facts, never books.
19. Production `getAutoOutput` for `when_missing` workplace (and later device).
20. Screen loop runs `runPendingEffect` → `publishRestore`.
21. Restore summary slice — intents only; no navigation inside the slice.
22. Delete only the obsolete first-run `clearSetupDraft` + `toImportSelection` path after confirming the settings compatibility route is still isolated. Restore is a journey switch, not a competing flow.
23. Delete the `OnboardingScreen` post-import branch once restore summary is the acknowledgement.

### F — Remove the old onboarding orchestrator

24. Delete `useOnboardingFlow`, `OnboardingDraftStore`, `onboardingFlowNavigation`, the OnboardingScreen wrapper, and tests that exist only for those.
25. Delete `onboardingStage` / `onboardingWorkplaceId` (and `pendingWorkplaceId` if launch no longer needs it) after `rg` shows no consumers.
26. Collapse `AppOnboardingProvider` if it only forwards `deviceRegistered`.
27. Keep shared visuals (`StepSplash`, workplace steps, theme, review). Rename when cheap, not as its own epic.

## Tests

Test the coordinator seam, not slice internals.

- **A:** store rejects impossible accepted output; accepts a restore handoff import already typed. Projection tests use the shared key.
- **B:** Device accept writes prefs; accept-failure does not advance. Finisher still registers idempotently.
- **C:** `next()` → present Device → accept → present Workplace. Back/edit unchanged.
- **D:** no draft + unclaimed device → Setup `first_run`; blocking restore draft still wins; optional draft does not block `open`.
- **E:** missing currency → present workplace; publication effect; crash after books → resume from operationId. First-run Restore no longer opens import-selection.
- **F:** `rg` for removed keys is the test.

Existing `SetupCoordinator` / `resolveNextSetupAction` / restore boundary tests stay. E2E after E, not after every extract.

## Out of scope

Demo slice, workplace replacement, visual redesign, generic workflow engine, schema-driven forms, migrating released draft data (unreleased; discard invalid).

## Order rationale

A/B first so C extracts a thin screen, not a messy one. D before E so restore resume is a launch concern, not a route param. E before F so post-import has a home before `OnboardingScreen` dies.
