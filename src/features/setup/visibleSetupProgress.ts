import { visibleSetupSliceIds, type SetupResolutionDefinitions } from './resolveNextSetupAction';
import type { SetupRecipe } from './setupRecipes';
import type {
  RestoreSetupDraft,
  SetupProgress,
  SetupSliceId,
  WorkplaceCheckpoint,
  WorkplaceSetupPrefill,
} from './setupTypes';
import { getRestoreWorkplacePrefill } from './restoreAutoOutput';

export function resolveWorkplaceStartCheckpoint({
  identityMode,
  initial,
  initialStep,
}: {
  readonly identityMode: SetupRecipe['workplaceIdentity'];
  readonly initial?: WorkplaceSetupPrefill;
  readonly initialStep?: WorkplaceCheckpoint;
}): WorkplaceCheckpoint {
  if (initialStep) return initialStep;
  if (identityMode === 'automatic') return 'currency';
  const hasImportedIdentity =
    Boolean(initial?.name?.value.trim()) && initial?.icon?.source === 'imported';
  const hasImportedCurrency = initial?.baseCurrency?.source === 'imported';
  return hasImportedIdentity && !hasImportedCurrency ? 'currency' : 'identity';
}

export function workplaceCheckpointsForProgress({
  identityMode,
  initial,
  currentCheckpoint,
}: {
  readonly identityMode: SetupRecipe['workplaceIdentity'];
  readonly initial?: WorkplaceSetupPrefill;
  readonly currentCheckpoint?: WorkplaceCheckpoint;
}): readonly WorkplaceCheckpoint[] {
  const start = resolveWorkplaceStartCheckpoint({ identityMode, initial });
  if (currentCheckpoint === 'identity' || start === 'identity') return ['identity', 'currency'];
  return ['currency'];
}

export function visibleSetupProgress({
  recipe,
  draft,
  definitions = {},
  currentSlice,
  workplaceCheckpoint,
}: {
  readonly recipe: SetupRecipe;
  readonly draft: RestoreSetupDraft;
  readonly definitions?: SetupResolutionDefinitions;
  readonly currentSlice: SetupSliceId;
  readonly workplaceCheckpoint?: WorkplaceCheckpoint;
}): SetupProgress {
  const slices = visibleSetupSliceIds(recipe, draft, definitions, currentSlice);
  const checkpoints = slices.includes('workplace')
    ? workplaceCheckpointsForProgress({
        identityMode: recipe.workplaceIdentity,
        initial: draft.workplace ?? getRestoreWorkplacePrefill(draft),
        currentCheckpoint: currentSlice === 'workplace' ? workplaceCheckpoint : undefined,
      })
    : [];
  const steps: string[] = [];
  for (const sliceId of slices) {
    if (sliceId === 'workplace') {
      steps.push(...checkpoints.map(checkpoint => `workplace:${checkpoint}`));
    } else {
      steps.push(sliceId);
    }
  }
  const currentKey =
    currentSlice === 'workplace'
      ? `workplace:${workplaceCheckpoint ?? checkpoints[0]}`
      : currentSlice;
  const index = Math.max(0, steps.indexOf(currentKey));
  return {
    current: index + 1,
    total: Math.max(1, steps.length),
    completed: Math.max(0, index),
  };
}
