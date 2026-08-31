import type {
  RestoreJourneyId,
  SetupEffectId,
  SetupEntryPolicy,
  SetupJourneyId,
  SetupSliceId,
  SetupSlicePolicy,
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

export interface SetupRecipe {
  readonly journeyId: SetupJourneyId;
  readonly entryPolicy: SetupEntryPolicy;
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

const firstRun: SetupRecipe = {
  journeyId: 'first_run',
  entryPolicy: 'blocking',
  entries: [
    slice('device', 'required'),
    slice('workplace', 'required'),
    slice('appearance', 'always_show'),
    slice('summary', 'required'),
  ],
};

const firstRunRestore: SetupRecipe = {
  journeyId: 'first_run_restore',
  entryPolicy: 'blocking',
  entries: [
    slice('restore_source', 'required'),
    slice('workplace', 'when_missing'),
    effect('publish_restore'),
    slice('restore_summary', 'required'),
    slice('device', 'when_missing'),
    slice('appearance', 'always_show'),
    slice('summary', 'required'),
  ],
};

const emptyDeviceWorkplace: SetupRecipe = {
  journeyId: 'empty_device_workplace',
  entryPolicy: 'blocking',
  entries: [slice('workplace', 'required'), slice('summary', 'required')],
};

const emptyDeviceRestore: SetupRecipe = {
  journeyId: 'empty_device_restore',
  entryPolicy: 'blocking',
  entries: [
    slice('restore_source', 'required'),
    slice('workplace', 'when_missing'),
    effect('publish_restore'),
    slice('restore_summary', 'required'),
  ],
};

const pickerRestore: SetupRecipe = {
  journeyId: 'picker_restore',
  // Blocking while the restore is selected; callers may keep the draft optional
  // when it was launched from the picker and an existing Workplace is usable.
  entryPolicy: 'blocking',
  entries: [
    slice('restore_source', 'required'),
    slice('workplace', 'when_missing'),
    effect('publish_restore'),
    slice('restore_summary', 'required'),
  ],
};

const settingsRestore: SetupRecipe = {
  journeyId: 'settings_restore',
  entryPolicy: 'optional',
  entries: [
    slice('restore_source', 'required'),
    slice('workplace', 'when_missing'),
    effect('publish_restore'),
    slice('restore_summary', 'required'),
  ],
};

const createWorkplace: SetupRecipe = {
  journeyId: 'create_workplace',
  entryPolicy: 'optional',
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

export function isRestoreRecipe(recipe: SetupRecipe): recipe is SetupRecipe & {
  readonly journeyId: RestoreJourneyId;
} {
  return (
    recipe.journeyId === 'first_run_restore' ||
    recipe.journeyId === 'empty_device_restore' ||
    recipe.journeyId === 'picker_restore' ||
    recipe.journeyId === 'settings_restore'
  );
}
