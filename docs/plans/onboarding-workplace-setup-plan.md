# Setup orchestration implementation plan

**Status:** Ready for implementation
**Date:** 2026-09-01
**Contract:** [`../specs/user-device-workplace/spec.md`](../specs/user-device-workplace/spec.md)
**Language:** [`../../CONTEXT.md`](../../CONTEXT.md)

## 1. Outcome

Replace the unreleased monolithic onboarding implementation with a small Setup system that composes Device, Workplace, Appearance, restore, and summary slices without duplicating routing or persistence rules.

The result must make a future Demo journal slice possible without changing coordinator control flow, while avoiding a generic workflow framework.

### Definition of done

- Launch decides whether Setup blocks app entry; it does not sequence Setup slices.
- Setup uses one linear resolver over plain recipes.
- Device, Workplace, Appearance, Restore source, Restore summary, and Setup summary have isolated ownership.
- Imports return typed facts and a Restore handoff instead of mutating global preferences or routing.
- Missing authoritative data causes the owning slice to appear.
- Fresh books publish only at Setup acceptance.
- Restore books publish after validation and before Restore summary, but remain inactive until the recipe accepts or opens them.
- Theme/font preview remains temporary until acceptance.
- The current overlapping stage flags, route state, and numeric-step logic are deleted.
- Settings import cannot change User name, theme, or font.
- Focused unit, integration, and mobile flows cover the behavior matrix.

## 2. Constraints

### Preserve

- User, Device, and Workplace ownership boundaries.
- Atomic Workplace/books publication.
- Database publication as the books commit point.
- Stable operation IDs and retry idempotency.
- Launch-time validation before books providers mount.
- Existing shared Workplace setup presentation components where their props remain honest.
- Existing import plugins and canonical import normalization.

### Do not preserve

The following are part of the same 13 unpushed commits and are not compatibility contracts:

- `user_profile | workplace_setup | appearance | review | post_import | complete`;
- numeric step projections;
- `isFullSetup`, `isPostImport`, and `returnToReview`;
- `onboardingCompleted`, `onboardingStage`, `onboardingWorkplaceId`, and `pendingWorkplaceId`;
- route parameters as persisted progress;
- the current Setup draft schema;
- tests that deliberately assert immediate theme persistence or imported Workplace-name overwrite.

Do not add migration readers for these shapes. Existing valid Workplace rows still receive ordinary Device recovery; that is data recovery, not compatibility with this unreleased Setup implementation.

### KISS boundary

Do not introduce:

- a graph or state-machine dependency;
- runtime, remote, or dependency-injected slice plugins;
- an event bus;
- a universal command/effect journal;
- abstract slice classes;
- schema-driven generic forms;
- a workflow database table;
- serialized imported books inside MMKV;
- a generic finisher configured through dozens of flags.

If implementation pressure appears to require one of these, stop and re-check the slice boundary first.

## 3. Current problems to remove

`useOnboardingFlow` currently owns route interpretation, draft hydration, every form field, navigation, import-return inference, theme writes, analytics, Device registration, summary loading, and completion. The extracted navigation function still hard-codes every mode and stage.

Concrete failures:

- restore with no name can bypass Device setup;
- backup name and typed-name precedence depends on stale draft state;
- imported Workplace identity can be overwritten by a generated Personal name;
- theme/font mutate global preferences before confirmation;
- Settings import restores global User preferences;
- import publication and post-import markers have a crash window;
- progress and recovery are inferred from five overlapping state sources;
- adding a slice requires edits across unions, switches, hooks, storage validation, progress, components, and tests.

The implementation should delete these mechanisms, not wrap them.

## 4. Target architecture

```text
LaunchCoordinator
├─ read validated blocking Setup draft
│  └─ setup(journeyId) → SetupCoordinator
└─ otherwise resolve Device/Workplace gate
   ├─ start first-run Setup
   ├─ start blocking Workplace Setup/Restore
   ├─ picker
   └─ open(workplaceId) → books providers

SetupCoordinator
├─ SetupDraftStore
├─ recipe[]
├─ resolveNextSetupAction(recipe, draft)
├─ slice registry
├─ one explicit restore-publication effect
└─ recipe finisher → typed outcome → caller/LaunchCoordinator
```

The coordinator is a renderer and executor for a tiny action union. It must contain no User-name precedence, Workplace defaults, import parsing, or theme persistence rules.

## 5. Proposed module layout

Rename the internal feature to `src/features/setup`. Keep the public `/onboarding` route if renaming the URL provides no functional value.

```text
src/features/setup/
├─ SetupCoordinator.tsx
├─ SetupScreen.tsx
├─ setupTypes.ts
├─ setupRecipes.ts
├─ resolveNextSetupAction.ts
├─ SetupDraftStore.ts
├─ setupFinishers.ts
├─ setupSliceRegistry.ts
├─ slices/
│  ├─ DeviceSetupSlice.tsx
│  ├─ WorkplaceSetupSlice.tsx
│  ├─ AppearanceSetupSlice.tsx
│  ├─ RestoreSourceSlice.tsx
│  ├─ RestoreSummarySlice.tsx
│  └─ SetupSummarySlice.tsx
└─ __tests__/
   ├─ resolveNextSetupAction.test.ts
   ├─ SetupDraftStore.test.ts
   ├─ setupRecipes.test.ts
   └─ setupFinishers.test.ts

src/services/import/
├─ prepareRestore.ts
├─ publishRestore.ts
├─ restoreTypes.ts
└─ ...existing plugins/canonical adapters...
```

Keep the layout flat. Do not create one directory per slice unless a slice genuinely grows multiple production files.

## 6. Domain types

Use explicit unions. The exact spelling may adjust during implementation, but the distinctions must remain.

```ts
type SetupJourneyId =
  | 'first_run'
  | 'first_run_restore'
  | 'empty_device_workplace'
  | 'empty_device_restore'
  | 'picker_restore'
  | 'settings_restore'
  | 'create_workplace';

type SetupEntryPolicy = 'blocking' | 'optional';

type SetupSliceId =
  'device' | 'restore_source' | 'workplace' | 'restore_summary' | 'appearance' | 'summary';

type SetupFactSource = 'user_entered' | 'imported' | 'existing' | 'defaulted';

type Sourced<T> = Readonly<{
  value: T;
  source: SetupFactSource;
}>;
```

Do not wrap every field in `Sourced<T>`. Use it only where source changes resolution or derivation: display name, Workplace identity/configuration, and appearance.

### 6.1 Explicit draft union

Use one schema version and a discriminated union rather than a generic output map.

```ts
interface SetupDraftBase {
  schemaVersion: 1;
  journeyId: SetupJourneyId;
  entryPolicy: SetupEntryPolicy;
  operationId: WorkplaceId;
  presentedHistory: readonly SetupSliceId[];
  activeSlice?: SetupSliceId;
  editingSlice?: SetupSliceId;
}

type SetupDraft = FirstRunSetupDraft | RestoreSetupDraft | WorkplaceCreationSetupDraft;
```

Each variant owns typed optional sections, for example:

```ts
interface DeviceSetupOutput {
  displayName: Sourced<string>;
}

interface WorkplaceSetupOutput {
  name: Sourced<string>;
  icon: Sourced<IconName>;
  baseCurrency: Sourced<string>;
  selectedAccounts: readonly StarterAccountInput[];
  selectedCategories: readonly StarterCategoryInput[];
  acceptedCheckpoints: readonly WorkplaceCheckpoint[];
}

interface AppearanceSetupOutput {
  themeId: Sourced<ThemeId>;
  fontId: Sourced<FontId>;
}
```

Restore-specific state contains only resumable metadata:

```ts
interface RestoreSourceRef {
  uri: string;
  name: string;
  size?: number;
  fingerprint: string;
}

interface RestoreDraftState {
  source?: RestoreSourceRef;
  discoveredFacts?: RestoreFacts;
  handoff?: RestoreHandoff;
}
```

Never store canonical import batches, journals, transactions, accounts, or raw file contents in this draft.

`activeSlice` is a narrow navigation override used when Back or Change intentionally reopens an already accepted slice. It is not a numeric cursor and does not determine completion; accepted outputs still do.

### 6.2 Terminal outcomes

Setup returns explicit outcomes instead of navigating:

```ts
type SetupOutcome =
  | { kind: 'device_registered' }
  | { kind: 'workplace_created'; workplaceId: WorkplaceId }
  | {
      kind: 'restore_accepted';
      workplaceId: WorkplaceId;
      next: 'open' | 'stay' | 'picker';
    }
  | {
      kind: 'journey_discarded';
      returnTo: 'first_run' | 'picker' | 'current_workplace';
    };
```

`continue` from first-run Restore summary is a slice intent, not a terminal outcome; the same Restore draft continues to Device/Appearance/summary.

### 6.3 Recipe entries

Recipes are ordered arrays. One explicit effect entry is justified because restore publication occurs between user-facing slices.

```ts
type SetupRecipeEntry =
  | {
      kind: 'slice';
      sliceId: SetupSliceId;
      policy: 'required' | 'when_missing' | 'always_show';
    }
  | { kind: 'effect'; effectId: 'publish_restore' };
```

Do not generalize beyond this union until a second real between-slice effect exists. This is an execution boundary, not an invitation to build an effect framework.

Representative recipes:

```ts
const firstRun = [
  slice('device', 'required'),
  slice('workplace', 'required'),
  slice('appearance', 'always_show'),
  slice('summary', 'required'),
];

const firstRunRestore = [
  slice('restore_source', 'required'),
  slice('workplace', 'when_missing'),
  slice('restore_summary', 'required'),
  effect('publish_restore'),
  slice('device', 'when_missing'),
  slice('appearance', 'always_show'),
  slice('summary', 'required'),
];
```

Picker and Settings restore reuse the same restore entries but omit Device, Appearance, and Setup summary.

## 7. Resolver contract

The resolver is pure.

```ts
type NextSetupAction =
  | { kind: 'present'; sliceId: SetupSliceId; progress: SetupProgress }
  | { kind: 'auto_accept'; sliceId: SetupSliceId; output: unknown }
  | { kind: 'run_effect'; effectId: 'publish_restore' }
  | { kind: 'finish' };

function resolveNextSetupAction(
  recipe: SetupRecipe,
  draft: SetupDraft,
  definitions: SetupResolutionDefinitions,
): NextSetupAction;
```

Rules:

1. Find the first recipe entry not accepted or executed.
2. `required` and `always_show` return `present` unless already accepted.
3. `when_missing` asks the slice definition for an authoritative auto-output.
4. If auto-output exists, return `auto_accept`; never perform the checkpoint inside the resolver.
5. An unexecuted restore publication boundary returns `run_effect`.
6. Once all entries are accepted/executed, return `finish`.

The coordinator loops through auto-accept actions one at a time. This keeps checkpoint effects observable, retryable, and testable without hiding a side-effect loop inside the resolver.

### 7.1 Presentation history

- Append a slice only when it is actually presented.
- Back pops to the previous presented slice and stores it as `activeSlice`, allowing an already accepted slice to be presented without deleting its output.
- Auto-accepted slices do not enter history.
- Summary Change sets `activeSlice` and `editingSlice`; accepting that slice clears both and returns directly to summary.
- Normal acceptance clears `activeSlice`, after which the resolver scans accepted outputs to find the next unresolved entry.
- Recompute derived outputs and final validity after every accepted edit.

Do not persist a separate numeric cursor. Accepted entries plus presentation history are sufficient.

## 8. Slice module contract

Keep the runtime interface narrow. A slice module may export:

```ts
interface SetupSliceDefinition<Output> {
  getAutoOutput?: (draft: SetupDraft) => Output | undefined;
  validate: (output: Output, draft: SetupDraft) => ValidationResult;
  checkpoint?: (output: Output, draft: SetupDraft) => Promise<void>;
  applyOutput: (draft: SetupDraft, output: Output) => SetupDraft;
  Component: React.ComponentType<SetupSliceProps<Output>>;
}
```

This is a plain object type, not a base class. If TypeScript inference becomes noisy, keep strong typing at module boundaries and use one small internal adapter in the registry; do not weaken the public draft union to `Record<string, unknown>`.

The coordinator supplies `onAccept`, `onBack`, and narrow recipe intents. Slices do not call Expo Router.

### 8.1 Device slice

- Validate `trim().length > 0`.
- Restore precedence: imported non-empty name, then User-entered candidate, otherwise missing.
- Auto-accept uses the same checkpoint as manual acceptance.
- Checkpoint writes the User name and then `deviceRegistered=true`; it persists accepted slice output only after both idempotent writes succeed.
- If a User/Device write or accepted-draft write fails, keep the slice current and show retry; do not present the next unresolved slice.
- `choose_restore` is an intent handled by the coordinator. Carry a non-empty typed candidate into the new Restore draft.

Order the checkpoint carefully:

1. ensure the blocking journey draft already exists;
2. build and validate the accepted Device output;
3. write trimmed User name;
4. write Device registration;
5. persist the accepted output into the journey draft;
6. advance only after step 5 succeeds.

If step 5 fails, the still-unaccepted blocking draft resumes Device setup. Its authoritative existing name/registration can auto-accept through the same idempotent checkpoint on retry. Avoid pretending MMKV writes across stores are atomic or adding a repair-status field.

### 8.2 Workplace slice

Reuse shared Workplace identity, currency, account, and category components. Keep its internal checkpoint state private to the slice output.

Configuration is explicit data, not branching inside the coordinator:

```ts
interface WorkplaceSliceConfig {
  identity: 'derived' | 'required' | 'when_missing';
  currency: 'required' | 'when_missing';
  starterBooks: 'required' | 'imported';
}
```

- First run: derived identity, required currency and starter books.
- Later creation: required identity, currency, and starter books.
- Restore: identity/currency when missing; imported starter books.

Derived Workplace name behavior:

- defaulted name follows accepted User-name edits;
- direct Workplace-name edit changes provenance to User-entered;
- User-entered Workplace name never changes implicitly afterward;
- imported identity is preserved unless explicitly edited.

Do not let restore fall through default starter selections. Imported books and counts come from prepared data or the published Workplace.

### 8.3 Appearance slice

- Initialize from imported valid appearance, then existing User appearance, then product default.
- First-run recipe always presents the slice.
- Put a temporary override above only the Setup subtree.
- Theme consumers inside Setup read override first, persisted User preference second.
- `setThemeId` and `setFontId` update local slice state only.
- Acceptance stores output in Setup draft; the finisher writes User preferences.
- Unmount/discard naturally removes the override; no rollback writes.

### 8.4 Restore source slice

- Persist operation ID before opening publication work.
- Pick and fingerprint the source.
- Detect the plugin and call `prepareRestore`.
- Persist source reference plus discovered facts, not parsed books.
- If required Workplace facts are missing, accept preparation and let the resolver present Workplace setup.
- On resume before publication, verify/reselect the source and re-run preparation.
- Expose parse and validation errors locally.
- Do not set User preferences, Device flags, Active workplace, or navigation.

### 8.5 Restore publication effect

The single between-slice effect performs:

1. verify the source fingerprint;
2. re-run or reuse in-memory prepared data;
3. apply accepted publication corrections;
4. call `publishRestore(prepared, corrections, operationId)`;
5. persist the returned Restore handoff in the draft;
6. mark the effect satisfied by the presence of a matching handoff.

Retry behavior:

- if no Workplace exists under the operation ID, publish;
- if it exists, verify it and reconstruct/read the handoff instead of inserting again;
- if verification fails, block and offer retry or explicit discard;
- never infer success from an unrelated Workplace.

### 8.6 Restore summary slice

- Read the exact Workplace ID from the handoff.
- Show authoritative shell data and counts from the database plus import warnings.
- Preserve imported name/icon unless the User invokes Change.
- Block actions while the Workplace cannot be read or verified.
- Report `continue`, `open`, `stay`, `return_to_picker`, or `discard` intent; do not navigate.

### 8.7 Setup summary slice

- Render only facts relevant to the recipe.
- Include auto-accepted facts.
- Route Change directly through coordinator edit state.
- Imported financial facts are read-only.
- Disable confirmation when any required output is invalid or dependent derivation is stale.
- Show a retryable finisher error without losing accepted outputs.

## 9. Restore service refactor

### 9.1 `prepareRestore`

Inputs:

- source bytes/context;
- detected or expected plugin;
- destination kind (`new_workplace` or replacement wrapper context);
- progress reporter.

Output:

```ts
interface PreparedRestore {
  fingerprint: string;
  canonicalData: CanonicalImport;
  facts: RestoreFacts;
  stats: ImportStats;
  warnings: readonly string[];
}
```

Responsibilities:

- plugin parsing;
- canonical adaptation;
- structural validation;
- extraction and sanitization of User, Workplace, and appearance facts;
- identifying missing publication-critical fields;
- no database or preference writes.

Do not let `PreferencesFacade.restoreImportedPreferences` decide setup precedence. That policy moves to Setup fact resolution.

### 9.2 `publishRestore`

Inputs:

- prepared restore;
- accepted Workplace corrections;
- stable operation ID;
- progress reporter.

Responsibilities:

- initialize currencies required for persistence;
- atomically publish shell and books;
- clear relevant caches;
- run integrity and balance rebuild work;
- return counts, warnings, imported facts, and the exact Workplace ID;
- no activation, Device registration, User-preference restoration, or navigation.

Post-publication integrity/rate failures that are currently warnings remain warnings. Database publication success must not be converted into failure by recoverable follow-up work.

### 9.3 Workplace replacement wrapper

Keep replacement explicit:

1. prepare;
2. create safety backup;
3. replace the named Workplace atomically;
4. rebuild/verify;
5. leave current User preferences and launch target unchanged.

Do not route replacement through Setup recipes merely to reuse UI.

## 10. Finishers

Use three exported functions, sharing only narrow helpers such as `verifyOperationWorkplace`, `writeAcceptedAppearance`, and cache eviction.

### 10.1 `finishFirstRun`

Input must be a validated first-run draft.

1. Derive final Workplace input from accepted outputs.
2. Check for the operation-owned Workplace.
3. If absent, publish Workplace, system accounts, starters, and any future draft journals in one transaction.
4. If present, verify identity/ownership and skip publication.
5. Write final User name and appearance idempotently.
6. Write Device registration and Active workplace.
7. Verify launch can observe the exact Workplace row.
8. Clear the draft.
9. Emit the appropriate outcome.

The Device name checkpoint may already have written the name and registration. Repeating those writes is intentional and harmless.

### 10.2 `finishRestoreSetup`

Parameterize only by the explicit Restore draft context, not a bag of booleans.

1. Verify the handoff and exact Workplace row.
2. Apply explicit imported Workplace name/icon edits, if any.
3. For first run, write accepted User name and appearance.
4. For registered-Device, picker, and Settings contexts, do not touch User preferences.
5. Persist Active workplace only for `activate/open` intent.
6. For `stay/return_to_picker`, leave it inactive and complete the optional/blocking subflow appropriately.
7. Clear the draft only after required writes succeed.
8. Emit `restore_accepted` with exact Workplace ID and activation intent.

### 10.3 `finishWorkplaceCreation`

1. Publish or verify the operation-owned Workplace atomically.
2. Clear the optional draft after publication is verified.
3. Emit `workplace_created(id)`.
4. Request the normal coordinator-owned transition.

If transition persistence fails, the new Workplace remains valid and discoverable; the old Active workplace remains authoritative until launch resolves again.

## 11. Launch integration

Extend launch resolution with one coarse result:

```ts
type LaunchResolution =
  | { kind: 'setup'; journeyId: SetupJourneyId }
  | { kind: 'device_setup' }
  | { kind: 'workplace_setup' }
  | { kind: 'picker' }
  | { kind: 'open'; workplaceId: WorkplaceId };
```

Implementation rules:

- validate the Setup draft before giving it priority;
- only blocking drafts resolve to `setup` automatically;
- optional drafts are queried by their initiating surface, not launch;
- `device_setup` starts or resumes `first_run`;
- `workplace_setup` offers fresh Workplace creation or Restore without repeating User/Appearance setup for a registered Device;
- outcomes trigger a fresh launch resolution rather than direct dashboard navigation;
- preserve existing books-provider unmount/transition guarantees.

Remove `hasCompletedOnboarding` from splash and Dashboard decisions. Splash readiness derives from launch reaching a stable gate or `open`, not a redundant preference boolean.

## 12. State and code removal

Delete or replace after all consumers move:

- `src/features/onboarding/domain/onboardingFlowNavigation.ts` and tests;
- `src/features/onboarding/domain/onboardingTypes.ts`;
- `src/features/onboarding/hooks/useOnboardingFlow.ts` and its mode-based tests;
- `src/features/onboarding/services/OnboardingService.ts`;
- the current `OnboardingDraftStore.ts` schema;
- `PostImportOnboardingStep.tsx` and `StepFinalize.tsx` if still unused;
- `AppOnboardingProvider` and `useOnboardingSession`;
- Device preference fields and setters for onboarding completed/stage/import/pending IDs;
- post-import route parameters and effects in `ImportSelectionScreen`;
- numeric-step progress and fixed-step E2E assumptions;
- immediate appearance writes from Setup components;
- first-run global preference restoration inside the former legacy import service.

Keep or adapt:

- shared Workplace setup visual components;
- `OnboardingStsPreview` under an honest Setup name;
- import format plugins and canonical adapters;
- atomic repository publication;
- LaunchCoordinator Workplace discovery/switch/delete behavior;
- Restore summary visual statistics where correct.

Run `rg` for every removed key/type before declaring cleanup complete.

## 13. Failure and interruption matrix

| Failure point                                       | Required behavior                                            |
| --------------------------------------------------- | ------------------------------------------------------------ |
| Draft checkpoint write fails                        | Stay on current slice; no checkpoint effect                  |
| Device/User checkpoint effect fails                 | Retain retryable draft; do not present next unresolved slice |
| Restore parsing fails                               | Show source error; create no rows                            |
| Required imported currency is missing               | Present currency before publication                          |
| Publication fails with no operation row             | Retain draft and retry publication                           |
| Publication response is uncertain but row exists    | Verify operation row; continue without duplicate             |
| Integrity/rate rebuild warns after publication      | Keep success, record warning in handoff                      |
| Restore handoff persistence fails after publication | Retain operation/source draft; recover by operation ID       |
| Restore summary cannot read Workplace               | Block; offer retry or explicit discard                       |
| User/appearance write fails after publication       | Keep draft and retry remaining writes                        |
| Active-workplace write fails                        | Keep draft; do not falsely report books failure              |
| App terminates before publication                   | Resume/reselect matching source                              |
| App terminates after publication                    | Resume from verified operation Workplace                     |
| Explicit discard deletion fails                     | Retain draft and show retry; do not claim discard            |
| Optional journey abandoned                          | Open current Workplace; retain Resume/Discard choice         |

## 14. Test plan

### 14.1 Pure resolver tests

Table-test every recipe entry and policy:

- required slice presents;
- accepted slice advances;
- `when_missing` auto-accepts authoritative output;
- default-only input does not auto-accept;
- `always_show` presents despite imported/existing output;
- auto-accepted slices do not enter Back history;
- edit returns directly to summary;
- restore publication effect runs exactly once per matching handoff;
- optional and blocking recipe metadata remains distinct;
- inserting a fake Demo journal slice into a recipe requires no resolver change.

### 14.2 Availability matrix

| Imported name | Typed candidate | Expected Device behavior    |
| ------------- | --------------- | --------------------------- |
| Present       | Present         | Auto-accept imported name   |
| Present       | Missing         | Auto-accept imported name   |
| Missing       | Present         | Auto-accept typed candidate |
| Missing       | Missing         | Present Device setup        |

| Imported Workplace identity | Imported currency | Expected pre-publication behavior |
| --------------------------- | ----------------- | --------------------------------- |
| Complete                    | Present           | Publish directly                  |
| Missing                     | Present           | Present identity only             |
| Complete                    | Missing/ambiguous | Present currency only             |
| Missing                     | Missing/ambiguous | Present identity then currency    |

Appearance matrix for first run always ends at presented Appearance setup, with imported/existing/default value only changing the prefill.

### 14.3 Draft-store tests

- strict parse of each discriminated variant;
- reject unknown schema version, journey, slice, source, and malformed branded IDs;
- reject impossible handoff/journey combinations;
- never partially accept corrupt arrays or nested objects;
- source metadata round-trip without raw books;
- clear only the exact active draft;
- no compatibility reader for the current unreleased schema.

### 14.4 Slice tests

- name trimming, precedence, and missing-name validation;
- derived Workplace name follows User name until direct edit;
- restore configuration presents only missing checkpoints;
- minimum fresh starter-book validation;
- appearance preview changes subtree without preference writes;
- restore summary locks imported financial facts;
- Restore source fingerprint mismatch requires reselection;
- Setup summary includes auto-accepted facts and blocks stale dependencies.

### 14.5 Restore service tests

- prepare performs no writes;
- publish creates one atomic Workplace graph;
- retry with the same operation ID does not duplicate;
- Settings/picker contexts never restore User preferences;
- imported User facts remain available to first-run draft resolution;
- publication preserves imported shell identity;
- missing corrections cannot reach publish;
- replacement preserves current User and Active-workplace state;
- post-publication warning behavior remains non-fatal.

### 14.6 Finisher tests

Inject failures after each ordered effect and retry:

- before publication;
- after publication;
- after User write;
- after appearance write;
- after Device registration;
- after Active-workplace write;
- before draft clear.

Assert one Workplace, no duplicate starter books, correct final preferences, and draft retention until success.

### 14.7 Launch integration tests

- blocking draft beats Device/Workplace resolution;
- optional draft does not block an existing Active workplace;
- invalid draft is rejected without deleting Workplaces;
- Device registered + zero Workplaces enters Workplace setup/restore gate;
- exact `open(id)` is observed before books mount;
- Setup outcome reruns launch resolution;
- no `onboardingCompleted` or stage flag participates.

### 14.8 Mobile flows

At minimum automate:

1. fresh setup through summary and dashboard;
2. first-run native restore with imported name;
3. first-run restore without any name, proving Device setup appears;
4. interrupted restore resumed after publication;
5. later Workplace creation and automatic validated transition;
6. Settings restore followed by Stay, proving User appearance/name unchanged.

Avoid fixed numeric progress assertions. Use slice-specific test IDs and user-visible outcomes.

## 15. Delivery slices and commit plan

Each commit must compile and keep unrelated behavior intact. Suggested sequence:

### Commit 1 — Record the contract

- Update glossary, ADRs, spec, and this plan.
- No production behavior changes.

### Commit 2 — Add Setup domain foundation

- Add explicit draft/types, recipes, pure resolver, strict store, and unit tests.
- Do not integrate UI yet.

Exit gate: resolver matrix and draft-store tests pass.

### Commit 3 — Port fresh Setup slices

- Add Setup Coordinator and single route.
- Port Device, Workplace, Appearance, and summary UI.
- Add scoped appearance preview.
- Keep fresh finisher behind the new draft.

Exit gate: fresh Setup component/unit tests pass; no immediate appearance writes.

### Commit 4 — Integrate fresh Setup with launch

- Give blocking drafts launch priority.
- Replace completion-flag splash/dashboard gating.
- Wire first-run and registered-Device/zero-Workplace recipes.
- Port later Workplace creation as optional.

Exit gate: launch integration tests and fresh mobile flow pass.

### Commit 5 — Split restore preparation and publication

- Extract `prepareRestore`, `publishRestore`, facts, fingerprint, and handoff.
- Preserve replacement through an explicit wrapper.
- Remove global User-preference restoration from new-Workplace import.

Exit gate: import service tests prove write-free preparation and isolated publication.

### Commit 6 — Add Restore recipes and slices

- Add source, missing-fact correction, publication effect, summary, discard, and resume.
- Wire first-run, empty-Device, picker, and Settings contexts.
- Preserve imported identity and explicit Open/Stay behavior.

Exit gate: availability matrix, crash/retry tests, and Restore mobile flows pass.

### Commit 7 — Remove obsolete implementation

- Delete old hook/state machine/services/dead components.
- Remove redundant Device keys, route markers, and migration code for unreleased shapes.
- Update analytics and E2E helpers to stable slice names.
- Run repository-wide searches for forbidden state.

Exit gate: no legacy symbols remain and architecture checks pass.

### Commit 8 — Final verification

- Run focused suites during development, then full verification.
- Perform simulator QA for Back, edit, interruption, retry, discard, and optional Resume/Discard.
- Re-read docs against final code and update only genuine implementation deviations.

## 16. Verification commands

Use focused tests first, then the repository gates:

```sh
bun test src/features/setup
bun test src/services/import
bun test src/services/launch
bun run typecheck
bun run check:architecture
bun run lint
bun run test:ci
```

Run relevant Detox/Maestro flows after the production path stabilizes. Do not use full mobile builds as the feedback loop for pure resolver or draft-store work.

## 17. Review checklist

Before calling the implementation complete, answer yes to all:

- Does launch know only whether Setup blocks, never which slice is current?
- Can the Setup Coordinator remain unchanged when a Demo journal slice is registered and added to a recipe?
- Is there exactly one Setup draft and no parallel completion/stage flag?
- Can every auto-completion be explained by authoritative fact provenance?
- Are defaults visibly suggestions rather than silent proof of completion?
- Can a restore retry after uncertain publication without duplicating books?
- Can Settings import be proven incapable of changing User preferences?
- Does imported Workplace identity survive unless explicitly edited?
- Does appearance preview avoid all preference writes before acceptance?
- Are fresh publication, restore acceptance, and later creation handled by explicit finishers?
- Are optional drafts invisible to normal launch?
- Are discarded restores operation-scoped and confirmed?
- Are there no runtime plugin, graph, generic form, or universal saga abstractions?
- Do docs, tests, and code use Setup journey/slice/checkpoint language consistently?

If any answer is no, the architecture is not done even if the happy path works.
