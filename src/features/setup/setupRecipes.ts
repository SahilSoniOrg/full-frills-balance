import {
  type RestoreSummaryIntent,
  type SetupDraft,
  type SetupEffectId,
  type SetupEntryPolicy,
  type SetupJourneyId,
  type SetupSliceId,
  type SetupSlicePolicy,
} from './setupTypes';

export type SetupRecipeEntry =
  | {
      readonly kind: 'slice';
      readonly sliceId: SetupSliceId;
      readonly policy: SetupSlicePolicy;
    }
  | {
      readonly kind: 'effect';
      readonly effectId: SetupEffectId;
    };

export type SetupAtStart = 'stay' | 'back' | 'dashboard' | 'first_run' | 'empty_device_workplace';
export type SetupDiscardTo = 'first_run' | 'picker' | 'empty_device_workplace' | 'settings';

export interface RestoreSummaryActions {
  readonly primary: { readonly intent: 'continue' | 'open'; readonly label: string };
  readonly secondary?: {
    readonly intent: Extract<RestoreSummaryIntent, 'return_to_picker' | 'stay'>;
    readonly label: string;
  };
}

export interface SetupRecipe {
  readonly journeyId: SetupJourneyId;
  readonly draftKind: SetupDraft['kind'];
  /** Whether the workplace identity step is seeded and hidden for this journey. */
  readonly workplaceIdentity: 'automatic' | 'editable';
  readonly entryPolicy: SetupEntryPolicy;
  readonly atStart: SetupAtStart;
  readonly discardTo?: SetupDiscardTo;
  readonly restoreSummary?: RestoreSummaryActions;
  readonly entries: readonly SetupRecipeEntry[];
}

const slice = (sliceId: SetupSliceId, policy: SetupSlicePolicy): SetupRecipeEntry => ({
  kind: 'slice',
  sliceId,
  policy,
});

const effect = (effectId: SetupEffectId): SetupRecipeEntry => ({
  kind: 'effect',
  effectId,
});

const restoreCore: readonly SetupRecipeEntry[] = [
  slice('restore_source', 'required'),
  slice('workplace', 'when_missing'),
  slice('restore_summary', 'required'),
  effect('publish_restore'),
];

const firstRun: SetupRecipe = {
  journeyId: 'first_run',
  draftKind: 'first_run',
  workplaceIdentity: 'automatic',
  entryPolicy: 'blocking',
  atStart: 'stay',
  entries: [
    slice('device', 'required'),
    slice('workplace', 'required'),
    slice('appearance', 'always_show'),
    slice('summary', 'required'),
  ],
};

const firstRunRestore: SetupRecipe = {
  journeyId: 'first_run_restore',
  draftKind: 'restore',
  workplaceIdentity: 'editable',
  entryPolicy: 'blocking',
  atStart: 'first_run',
  discardTo: 'first_run',
  restoreSummary: { primary: { intent: 'continue', label: 'Continue setup' } },
  entries: [
    ...restoreCore,
    slice('device', 'when_missing'),
    slice('appearance', 'always_show'),
    slice('summary', 'required'),
  ],
};

const emptyDeviceWorkplace: SetupRecipe = {
  journeyId: 'empty_device_workplace',
  draftKind: 'workplace_creation',
  workplaceIdentity: 'automatic',
  entryPolicy: 'blocking',
  atStart: 'stay',
  entries: [slice('workplace', 'required'), slice('summary', 'required')],
};

const emptyDeviceRestore: SetupRecipe = {
  journeyId: 'empty_device_restore',
  draftKind: 'restore',
  workplaceIdentity: 'editable',
  entryPolicy: 'blocking',
  atStart: 'empty_device_workplace',
  discardTo: 'empty_device_workplace',
  restoreSummary: { primary: { intent: 'open', label: 'Activate' } },
  entries: restoreCore,
};

const pickerRestore: SetupRecipe = {
  journeyId: 'picker_restore',
  draftKind: 'restore',
  workplaceIdentity: 'editable',
  entryPolicy: 'blocking',
  atStart: 'dashboard',
  discardTo: 'picker',
  restoreSummary: {
    primary: { intent: 'open', label: 'Open workplace' },
    secondary: { intent: 'return_to_picker', label: 'Return to picker' },
  },
  entries: restoreCore,
};

const settingsRestore: SetupRecipe = {
  journeyId: 'settings_restore',
  draftKind: 'restore',
  workplaceIdentity: 'editable',
  entryPolicy: 'optional',
  atStart: 'back',
  discardTo: 'settings',
  restoreSummary: {
    primary: { intent: 'open', label: 'Open workplace' },
    secondary: { intent: 'stay', label: 'Stay here' },
  },
  entries: restoreCore,
};

const createWorkplace: SetupRecipe = {
  journeyId: 'create_workplace',
  draftKind: 'workplace_creation',
  workplaceIdentity: 'editable',
  entryPolicy: 'optional',
  atStart: 'back',
  entries: [slice('workplace', 'required'), slice('summary', 'required')],
};

export const SETUP_RECIPES: Readonly<Record<SetupJourneyId, SetupRecipe>> = {
  first_run: firstRun,
  first_run_restore: firstRunRestore,
  empty_device_workplace: emptyDeviceWorkplace,
  empty_device_restore: emptyDeviceRestore,
  picker_restore: pickerRestore,
  settings_restore: settingsRestore,
  create_workplace: createWorkplace,
};

export function getSetupRecipe(journeyId: SetupJourneyId): SetupRecipe {
  return SETUP_RECIPES[journeyId];
}

export function recipeContainsSlice(recipe: SetupRecipe, sliceId: SetupSliceId): boolean {
  return recipe.entries.some(entry => entry.kind === 'slice' && entry.sliceId === sliceId);
}

export function recipeTerminalSlice(recipe: SetupRecipe): SetupSliceId {
  for (let index = recipe.entries.length - 1; index >= 0; index -= 1) {
    const entry = recipe.entries[index];
    if (entry?.kind === 'slice') return entry.sliceId;
  }
  throw new Error(`Setup recipe ${recipe.journeyId} has no slices`);
}
