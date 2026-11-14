import { useState } from 'react';
import { getRestoreAutoOutput, getRestoreWorkplacePrefill } from '../restoreAutoOutput';
import type { SetupRecipe } from '../setupRecipes';
import type { NextSetupAction } from '../resolveNextSetupAction';
import {
  type RestoreSetupDraft,
  type SetupSliceId,
  type WorkplaceCheckpoint,
} from '../setupTypes';
import { resolveWorkplaceStartCheckpoint, visibleSetupProgress } from '../visibleSetupProgress';

interface SetupJourneyViewStateOptions {
  candidateName: string;
  recipe: SetupRecipe;
  draft: RestoreSetupDraft;
  action: NextSetupAction;
  slice: SetupSliceId | undefined;
}

export function useSetupJourneyViewState({
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
      initial: draft.workplace ?? getRestoreWorkplacePrefill(draft),
    }),
  );

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

  return {
    workplaceTargetStep,
    setWorkplaceTargetStep,
    workplaceStep,
    setWorkplaceStep,
    displayName,
    workplaceInitial,
    workplaceCheckpoint,
    displayProgress,
  };
}
