import { visibleSetupSliceIds, type SetupResolutionDefinitions } from './resolveNextSetupAction';
import type { SetupRecipe } from './setupRecipes';
import {
  isRestoreJourneyId,
  type SetupDraft,
  type SetupProgress,
  type SetupSliceId,
  type WorkplaceCheckpoint,
  type WorkplaceSetupPrefill,
} from './setupTypes';

export function resolveWorkplaceStartCheckpoint({
  identityMode,
  books,
  initial,
  initialStep,
}: {
  readonly identityMode: SetupRecipe['workplaceIdentity'];
  readonly books: 'starters' | 'imported';
  readonly initial?: WorkplaceSetupPrefill;
  readonly initialStep?: WorkplaceCheckpoint;
}): WorkplaceCheckpoint {
  if (initialStep) return initialStep;
  if (identityMode === 'automatic') return 'currency';
  if (books !== 'imported') return 'identity';
  const hasIdentity = Boolean(initial?.name?.value.trim()) && initial?.icon?.source === 'imported';
  const missingCurrency = initial?.baseCurrency?.source !== 'imported';
  return hasIdentity && missingCurrency ? 'currency' : 'identity';
}

export function workplaceCheckpointsForProgress({
  identityMode,
  books,
  initial,
  currentCheckpoint,
}: {
  readonly identityMode: SetupRecipe['workplaceIdentity'];
  readonly books: 'starters' | 'imported';
  readonly initial?: WorkplaceSetupPrefill;
  readonly currentCheckpoint?: WorkplaceCheckpoint;
}): readonly WorkplaceCheckpoint[] {
  if (books === 'imported') {
    const start = resolveWorkplaceStartCheckpoint({ identityMode, books, initial });
    if (currentCheckpoint === 'identity' || start === 'identity') return ['identity', 'currency'];
    return ['currency'];
  }
  if (identityMode === 'automatic') {
    const screens: WorkplaceCheckpoint[] = ['currency', 'accounts', 'categories'];
    return currentCheckpoint === 'identity' ? ['identity', ...screens] : screens;
  }
  return ['identity', 'currency', 'accounts', 'categories'];
}

export function visibleSetupProgress({
  recipe,
  draft,
  definitions = {},
  currentSlice,
  workplaceCheckpoint,
}: {
  readonly recipe: SetupRecipe;
  readonly draft: SetupDraft;
  readonly definitions?: SetupResolutionDefinitions;
  readonly currentSlice: SetupSliceId;
  readonly workplaceCheckpoint?: WorkplaceCheckpoint;
}): SetupProgress {
  const slices = visibleSetupSliceIds(recipe, draft, definitions, currentSlice);
  const books = isRestoreJourneyId(recipe.journeyId) ? 'imported' : 'starters';
  const checkpoints = slices.includes('workplace')
    ? workplaceCheckpointsForProgress({
        identityMode: recipe.workplaceIdentity,
        books,
        initial: draft.workplace,
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
