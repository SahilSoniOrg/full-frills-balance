# Onboarding and setup merge plan

**Status:** phases 1 and 2 done; phase 3 not planned. Follows `over-engineering-cleanup-plan.md`.

## How to resume

Work phase by phase. Each phase ends green (`bun run verify` fully green) with first-run, restore and create-workplace completable on a device. Update the Progress table and Log after each commit.

## Current shape

Two features own first-run:

| Feature | Prod lines | Owns |
| --- | --- | --- |
| `src/features/onboarding` | ~3.7k | Cash clarity: conversational first-run (welcome, currency, now, next, protect, reserve, clarity), its own draft (`draft.ts`, `draftTransitionModel.ts`), commit (`commitCashClarity.ts`). |
| `src/features/setup` | ~7.9k | Setup kernel: `SetupCoordinator`, recipes, `SetupDraftStore`, finishers, and the UI for restore and extra-workplace journeys (`first_run_restore`, `empty_device_*`, `picker_restore`, `settings_restore`, `create_workplace`). |

`src/features/app/OnboardingRoute.tsx` serves `/onboarding`: `shouldShowCashClarity` sends `first_run` launches to cash clarity and everything else to `SetupScreen` (since `be685d1a`, 2026-09-15).

Coupling is one-way (onboarding → setup, allowlisted in `scripts/cross-feature-boundary-allowlist.json`):

- UI: `housekeeping.tsx` renders setup's `WorkplaceCurrencyStep`.
- Types: `mapToWorkplaceOutput.ts` builds a setup `WorkplaceSetupOutput`.
- Commit: `commitCashClarity.ts` calls `finishDeviceSetup`, `finishWorkplaceSetup`, `clearSetupDraft`.
- Handoff: `OnboardingScreen.tsx` calls `startFirstRunRestoreFromDeviceName`, then navigates to `first_run_restore`.

## Findings

1. **Setup still carries a second first-run flow.** The `first_run` recipe (device → workplace → appearance → summary), the `first_run` draft kind, and their tests remain. `/onboarding` never routes a first-run launch to it.
2. **That flow is still reachable, probably by accident.** `first_run_restore.discardTo = 'first_run'`. Discarding a restore that started from cash clarity calls `onSwitchJourney('first_run')`, which sets `SetupScreen`'s in-screen `journeyOverride`. The route param stays `first_run_restore`, so `OnboardingRoute` keeps `SetupScreen` mounted and the user lands in the old setup first-run, not back in cash clarity. `resolveSetupJourney`'s last fallback (`deviceRegistered ? 'empty_device_workplace' : 'first_run'`) can land there too. Tests only assert that `onSwitchJourney('first_run', name)` is called (`setupRuntime.test.ts`), not which screen renders.
3. **Cash clarity skips the appearance step.** `finishSetup` applies appearance only for `first_run` drafts. Cash-clarity users never pick a theme during first-run; `first_run_restore` users do. Decide whether that asymmetry is intended.

## Phases

### 1. Retire setup's legacy first-run (fix + delete)

- Restore discard from `first_run_restore` returns to cash clarity: navigate to `/onboarding` with journey `first_run` (route change, not `journeyOverride`), keeping the device-name candidate.
- Replace the `resolveSetupJourney` `'first_run'` fallback with a redirect to cash clarity.
- Delete the `first_run` recipe, the `first_run` draft kind (`setupTypes`, `SetupDraftStore.parseFirstRun`, `SetupCoordinator` seed branch, `finishSetup` appearance branch if unused), and `first_run`-only tests. Keep the device, appearance and summary slices: `first_run_restore` uses them.
- Persisted drafts: an installed app can hold a saved `first_run` setup draft. Treat it as unreadable (existing `discardUnreadableSetupDraft` path) so launch falls back to cash clarity.
- Tests: route-level test that restore discard renders cash clarity.

### 2. One feature folder

- Move `src/features/onboarding` into `src/features/setup/first-run/` (file moves plus import updates). `OnboardingRoute` imports one barrel; the `onboarding → setup` allowlist entry goes away.
- No behavior change.

### 3. Optional: cash clarity on the setup coordinator

- Model cash clarity's steps as setup slices so first-run and restore share one draft store, progress model and resume path.
- High cost: cash clarity has its own draft, transition model and conversational UI. Only worth it if phase 1–2 leave real duplication (draft persistence, progress, resume). Re-evaluate after phase 2.

## Decisions

- Restore discard lands in cash clarity with the entered name kept (owner, 2026-09-27).
- First run stays theme-free; the appearance step is dropped from `first_run_restore` too (owner, 2026-09-27). Theme lives in Settings.

## Progress

| Phase | Status | Commit |
| --- | --- | --- |
| 1. Retire legacy first-run | done | `1371b81a`, `62f40a4d`, `1fd1a84f` |
| 2. One feature folder | done | `849d7fb0` |
| 3. Cash clarity on coordinator | not planned yet | |

## Log

- 2026-09-27: Plan written from code survey. Finding 2 found from code reading; confirm on device before fixing.
- 2026-09-27: Phase 1 done in three commits.
  - `1371b81a`: restore discard calls `AppNavigation.toFirstRun(name)` (route replace to `/onboarding?journey=first_run&name=…`); `OnboardingScreen` seeds `displayName` from the `name` param.
  - `62f40a4d`: `first_run` removed from `SETUP_JOURNEY_IDS`, recipes and draft kinds (it stays a launch journey string). `resolveSetupJourney` returns `undefined` for an unregistered device and `SetupScreen` redirects to cash clarity. `shouldSeedSetupDraft` deleted (always true once journey IDs exclude `first_run`). Saved `first_run` drafts parse as unreadable, so launch lands in cash clarity, whose commit clears the draft.
  - `1fd1a84f`: appearance slice, `AppearanceThemeStep`, `finishAppearanceSetup`, draft field, summary/review rows and copy removed (-863 lines). `parseSetupDraft` strips a legacy `appearance` step/field so an in-flight restore saved before the update stays readable. Restore no longer applies the theme from the backup (import still parses `RestoreFacts.appearance`; unused by setup now). Detox setup specs updated to skip the theme screen.
  - `verify`: same 3 known failing suites / 7 tests; lint 0 errors. Not yet exercised on a device: restore discard back to cash clarity, and a first-run restore end to end.
- 2026-09-27: Phase 2 done (`849d7fb0`). `src/features/onboarding` is now `src/features/setup/first-run` (pure renames). First-run imports setup modules directly (`../SetupDraftStore`, `../setupFinishers`, `../SetupCoordinator`, `../setupTypes`, `WorkplaceCurrencyStep`) instead of the setup barrel; test mocks follow. The setup barrel exports `CashClarityScreen`, which `OnboardingRoute` renders. Allowlist entries for `onboarding` removed. Architecture checks (feature boundaries, dependency cycles) pass.
