# Settings layers remediation plan

Status: implementation complete for Phases 1–4; Phase 5 deferred

## Implementation record

- [x] SMS preference behavior separated from notification scheduling.
- [x] Personalization draft ownership and external-update behavior defined in the view model.
- [x] Maintenance command proxy removed while preserving reset ordering and analytics.
- [x] Workplace sorting and SMS-rule presentation parsing reduced to stable derived work.
- [ ] SMS automation feature relocation; deferred pending concrete ownership pressure.

The existing staged settings redesign was preserved. These changes were applied on top of that
working tree without resetting, staging, or committing the user's changes.

Verification completed:

- architecture checks passed;
- TypeScript and e2e TypeScript checks passed;
- 13 settings suites passed (41 tests);
- full CI test suite passed (336 suites, 1,995 tests, 1 skipped);
- lint passed with no warnings.
- mobile Detox settings E2E was not run because no configured device/build was available.

## Objective

Tighten settings ownership where the current code shows a concrete problem, while preserving the
settings redesign already staged in the working tree. The work should reduce cross-screen hook
coupling, define the profile-name draft lifecycle, and remove small proven sources of repeated work.

## Prerequisite

The currently staged settings redesign remains the behavioral baseline. This remediation was kept
as a separate unstaged layer and was not combined into the staged changes.

Record the baseline results for:

- `bun run check:architecture`;
- the existing notification settings hook test;
- the settings navigation E2E tests on Android, where SMS controls are visible.

## Decisions already made

- Keep `src/features/settings/components/SettingsMenuItem.tsx` as the adapter between the settings
  search catalog and the shared focusable menu-item primitive.
- Keep `searchId` as the feature-level contract and `focusId` as the shared presentation contract.
  Do not add a settings-search alias to the shared component.
- Keep `DataExportSection` and `useDataExportViewModel` as a cohesive child workflow. Do not merge
  export state back into `useDataManagementViewModel`.
- Treat a separate SMS automation feature as an optional ownership move. It is not required to fix
  the settings-layer defects below.
- Preserve current routes, copy, analytics events, preference keys, and platform behavior.

## Phase 1: Separate SMS preference behavior from notification scheduling

### Change

Create a narrowly scoped hook for the SMS-import preference and its analytics, for example
`src/features/settings/hooks/useSmsImportSetting.ts`.

The hook owns:

- reading `isSmsImportEnabled` from `useSmsPrefs`;
- persisting the toggle;
- `logSmsImportSettingsChanged` and the existing `toggle_sms_import` feature event.

Then:

- remove SMS preferences and SMS navigation from
  `useNotificationSettingsViewModel.ts`;
- keep `useNotificationSettingsViewModel` responsible only for notification cadence, permission,
  scheduling, and test notifications;
- use the new SMS hook directly in `DeviceSettingsScreen.tsx`;
- compose notification state, SMS visibility, and the two navigation callbacks in
  `AutomationSettingsScreen.tsx` before passing them to `AutomationSettingsView`;
- adjust the view props so notification and SMS automation concerns are explicit rather than one
  misleading `NotificationSettingsViewModel` object.

### Regression coverage

- Existing notification ordering and stale-permission-result behavior remains green.
- Add a focused hook test proving one toggle writes the preference and emits both existing analytics
  events exactly once.
- Verify Android shows the SMS toggle, inbox link, and conditional rules link as before.
- Verify non-Android platforms do not gain SMS controls.

### Acceptance gate

- `DeviceSettingsScreen` no longer imports or initializes the notification view model.
- The notification view model has no dependency on `useSmsPrefs` or `AppNavigation`.
- Event names and toggle behavior are unchanged.

Suggested commit: `refactor(settings): isolate sms import preference`

## Phase 2: Define personalization draft ownership

### Change

Move the editable name draft into `usePersonalizationViewModel.ts`. Expose the persisted name only
if the view needs it; the view should primarily receive `draftName`, `setDraftName`, and
`commitName`.

Use this lifecycle:

- when the persisted name changes and the draft is clean, update the draft;
- while the user has unsaved edits, do not overwrite the draft with an external update;
- on blur or submit, trim and save a non-empty changed value;
- if the draft is empty or whitespace, restore the current persisted value;
- after a successful save, mark the draft clean and display the normalized value;
- if an external update arrives during editing, an explicit subsequent local commit wins.

Do not add debouncing: the current product commits only on blur or submit.

### Regression coverage

Add hook-level cases for:

- clean draft follows an external preference update;
- dirty draft survives an external update;
- whitespace-only input restores the persisted name;
- committed input is trimmed and emits the existing analytics event once;
- unchanged input performs no write and emits no event.

### Acceptance gate

- `PersonalizationSettingsView.tsx` contains no local name state.
- External preference changes have deterministic behavior.
- Empty input cannot leave the field visually blank while a different value remains persisted.

Suggested commit: `fix(settings): define profile name draft lifecycle`

## Phase 3: Collapse the stale maintenance command proxy

### Change

Use `useMaintenanceSettingsViewModel.ts` as the composition root for maintenance commands:

- obtain `workplaceId` and `requireRestart` once;
- create stable callbacks for integrity check, cleanup, and factory reset;
- keep factory-reset analytics, database reset ordering, and restart request intact;
- pass those callbacks into `useDataMaintenanceActions`;
- delete `useSettingsActions.ts` after its last caller is removed.

Do not move service access into `useDataMaintenanceActions`. That hook should continue to own
confirmation dialogs, progress state, error presentation, and the development seeding interaction,
with its destructive operations supplied as dependencies.

### Regression coverage

Add or retain a focused interaction test proving the reset order:

1. confirmation callback runs;
2. reset analytics is recorded;
3. database reset resolves;
4. restart is requested.

Also verify a failed reset does not request restart and still reaches the existing error path.

### Acceptance gate

- There is one `useAppRestart` subscription in the maintenance composition path.
- `useSettingsActions.ts` is gone.
- Confirmation copy and all maintenance analytics remain unchanged.

Suggested commit: `refactor(settings): compose maintenance commands directly`

## Phase 4: Remove proven repeated render work

### Change

- Memoize the alphabetically sorted workplace projection in
  `useWorkplaceSettingsViewModel.ts`, keyed by the observed workplaces array.
- In `SmsRuleCardView.tsx`, derive conditions, condition summary, and action label once per relevant
  serialized rule value. Reuse those derived values throughout the card.
- Preserve malformed-JSON fallbacks and current labels.

Do not memoize `FlatList` headers or render callbacks in this pass. Add that only if profiling shows
meaningful repeated renders; callback identity alone is insufficient evidence.

### Regression coverage

- Add pure helper cases for structured rules, legacy sender/body rules, each action disposition, and
  malformed JSON.
- Keep the workplace ordering assertion at the view-model boundary if a suitable existing test
  harness exists; do not build a large harness solely for memoization.

### Acceptance gate

- Each populated JSON field is parsed at most once per card derivation.
- Workplace order and SMS-rule copy are unchanged.
- No new cache or state-management abstraction is introduced.

Suggested commit: `perf(settings): avoid repeated settings projections`

## Phase 5: Decide whether SMS automation deserves its own feature

This is a decision gate, not part of the mandatory remediation.

Proceed only if at least one concrete pressure exists: independent product ownership, repeated
changes outside settings, a growing public API, or settings-specific dependencies blocking reuse.

If the move is justified:

- create `src/features/automation/` with a public `index.ts`;
- move transaction inbox, SMS rules, rule form, related components, hooks, mappings, and tests as
  one behavior-preserving change;
- update `app/sms-inbox.tsx`, `app/sms-rules.tsx`, and `app/sms-rule-form.tsx` to import only the new
  public barrel;
- leave `AutomationSettingsScreen` in settings as the configuration and navigation entry point;
- keep SMS parsing, rule evaluation, repositories, and journal mutations in their existing service
  and persistence layers;
- avoid renaming internal types during the move so file relocation remains reviewable.

If no concrete pressure exists, document the decision and leave the files where they are.

### Acceptance gate if moved

- Route behavior and deep links are unchanged.
- Settings imports no automation presentation internals.
- The feature-boundary and dependency-cycle checks pass without new allowlist debt.
- Inbox refresh, import, duplicate resolution, rule editing, and auto-post integration tests remain
  green.

Suggested commit: `refactor(automation): separate sms operational screens`

## Final verification

Run after each phase's focused tests, then once across the complete series:

- `bun run check:architecture`;
- `bun run typecheck`;
- focused settings hook and component tests;
- `bun run lint`;
- `bun run test:ci` before landing;
- Android settings navigation and SMS-toggle E2E coverage;
- inbox/rules E2E coverage only if Phase 5 is performed.

Stop and fix the individual phase if it changes visible copy, navigation, platform gating,
preference persistence, or analytics. Keep each phase independently reviewable and do not fold the
rejected wrapper or export-view-model merges into this work.
