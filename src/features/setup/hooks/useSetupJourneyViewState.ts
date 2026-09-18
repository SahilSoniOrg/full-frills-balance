import { FontId, FontIds, ThemeId, ThemeIds } from '@/src/constants';
import { useState } from 'react';
import {
  getRestoreAutoOutput,
  getRestoreAppearancePrefill,
  getRestoreWorkplacePrefill,
} from '../restoreAutoOutput';
import { recipeContainsSlice, type SetupRecipe } from '../setupRecipes';
import type { NextSetupAction } from '../resolveNextSetupAction';
import {
  isRestoreJourneyId,
  type SetupDraft,
  type SetupJourneyId,
  type SetupSliceId,
  type WorkplaceCheckpoint,
} from '../setupTypes';
import { resolveWorkplaceStartCheckpoint, visibleSetupProgress } from '../visibleSetupProgress';

interface SetupJourneyViewStateOptions {
  journeyId: SetupJourneyId;
  candidateName: string;
  recipe: SetupRecipe;
  draft: SetupDraft;
  action: NextSetupAction;
  slice: SetupSliceId | undefined;
}

export function useSetupJourneyViewState({
  journeyId,
  candidateName,
  recipe,
  draft,
  action,
  slice,
}: SetupJourneyViewStateOptions) {
  const [workplaceTargetStep, setWorkplaceTargetStep] = useState<WorkplaceCheckpoint>();
  const [workplaceStep, setWorkplaceStep] = useState<WorkplaceCheckpoint>(() =>
    resolveWorkplaceStartCheckpoint({
      identityMode: recipe.workplaceIdentity,
      books: isRestoreJourneyId(journeyId) ? 'imported' : 'starters',
      initial: draft.workplace ?? getRestoreWorkplacePrefill(draft),
    }),
  );
  const [appearancePreview, setAppearancePreview] = useState<{
    themeId: ThemeId;
    fontId: FontId;
  }>();

  const displayName =
    ('device' in draft ? draft.device?.displayName.value : undefined) ||
    (draft.kind === 'restore' ? draft.restore.deviceCandidate?.value : undefined) ||
    candidateName;
  const workplaceInitial = draft.workplace ?? getRestoreWorkplacePrefill(draft);
  const workplaceCheckpoint =
    slice === 'workplace' ? (workplaceTargetStep ?? workplaceStep) : undefined;
  const displayProgress =
    action.kind === 'present'
      ? visibleSetupProgress({
          recipe,
          draft,
          definitions: { getAutoOutput: getRestoreAutoOutput },
          currentSlice: action.sliceId,
          workplaceCheckpoint,
        })
      : { current: 1, total: 1, completed: 0 };
  const appearanceInitial =
    ('appearance' in draft ? draft.appearance : undefined) ?? getRestoreAppearancePrefill(draft);
  const appearanceOverride =
    appearancePreview ??
    ((slice === 'appearance' || slice === 'summary') && recipeContainsSlice(recipe, 'appearance')
      ? {
          themeId: appearanceInitial?.themeId.value ?? ThemeIds.DEEP_SPACE,
          fontId: appearanceInitial?.fontId.value ?? FontIds.DEEP_SPACE,
        }
      : undefined);

  return {
    workplaceTargetStep,
    setWorkplaceTargetStep,
    workplaceStep,
    setWorkplaceStep,
    setAppearancePreview,
    displayName,
    workplaceInitial,
    workplaceCheckpoint,
    displayProgress,
    appearanceInitial,
    appearanceOverride,
  };
}
