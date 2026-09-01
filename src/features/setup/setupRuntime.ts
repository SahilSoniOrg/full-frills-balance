import { AppNavigation } from '@/src/utils/navigation';
import { publishRestore } from '@/src/services/import/publishRestore';
import { generator } from '@/src/data/database/idGenerator';
import { preferences } from '@/src/utils/preferences';
import {
  createSetupCoordinator,
  createSetupDraft,
  type SetupCoordinator,
} from './SetupCoordinator';
import { loadPreparedRestore } from './pickRestoreSource';
import { getRestoreAutoOutput } from './restoreAutoOutput';
import { discardPublishedRestore, finishDeviceSetup, finishSetup } from './setupFinishers';
import { getSetupRecipe, recipeContainsSlice } from './setupRecipes';
import { clearSetupDraft, loadSetupDraft, saveSetupDraft } from './SetupDraftStore';
import {
  isSetupJourneyId,
  type SetupDraft,
  type SetupJourneyId,
  type SetupOutcome,
} from './setupTypes';
import type { WorkplaceId } from '@/src/types/ids';

export function resolveOptionalJourney(params: {
  mode?: string;
  journey?: string;
}): SetupJourneyId | undefined {
  if (params.mode === 'full') return 'create_workplace';
  if (params.journey && isSetupJourneyId(params.journey)) return params.journey;
  return undefined;
}

export function resolveSetupJourney(
  params: { mode?: string; journey?: string },
  override?: SetupJourneyId,
): SetupJourneyId {
  if (override) return override;
  const draft = loadSetupDraft();
  if (draft?.entryPolicy === 'blocking' && isSetupJourneyId(draft.journeyId)) {
    return draft.journeyId;
  }
  return (
    resolveOptionalJourney(params) ??
    (draft && isSetupJourneyId(draft.journeyId) ? draft.journeyId : undefined) ??
    (preferences.device.deviceRegistered ? 'empty_device_workplace' : 'first_run')
  );
}

export function createJourneyCoordinator(journeyId: SetupJourneyId): SetupCoordinator {
  const recipe = getSetupRecipe(journeyId);
  const existing = loadSetupDraft();
  const draft = existing?.journeyId === journeyId ? existing : createSeededDraft(journeyId);
  if (existing?.journeyId !== journeyId) saveSetupDraft(draft);
  return createSetupCoordinator({
    journeyId,
    operationId: draft.operationId,
    draft,
    resolution: { getAutoOutput: getRestoreAutoOutput },
    effects: {
      commitDevice: finishDeviceSetup,
      publishRestore: async restoreDraft => {
        const prepared = await loadPreparedRestore(restoreDraft);
        const workplace = restoreDraft.workplace;
        if (!workplace) throw new Error('Workplace corrections are missing');
        return publishRestore(prepared, {
          operationId: restoreDraft.operationId,
          corrections: {
            name: workplace.name.value,
            icon: workplace.icon.value,
            defaultCurrencyCode: workplace.baseCurrency.value,
          },
        });
      },
    },
    finish: async finished => finishJourney(finished, recipeContainsSlice(recipe, 'appearance')),
  });
}

function createSeededDraft(journeyId: SetupJourneyId): SetupDraft {
  return createSetupDraft(journeyId, generator() as WorkplaceId);
}

async function finishJourney(draft: SetupDraft, applyAppearance: boolean): Promise<SetupOutcome> {
  if (draft.kind === 'restore') {
    const intent = draft.restore.summary?.intent ?? 'continue';
    const workplaceId = await finishSetup(draft, {
      activate: intent === 'open' || intent === 'continue',
      applyAppearance,
    });
    if (!workplaceId) throw new Error('Restore publication is incomplete');
    return {
      kind: 'restore_accepted',
      workplaceId,
      next: intent === 'stay' ? 'stay' : intent === 'return_to_picker' ? 'picker' : 'open',
    };
  }
  const workplaceId = await finishSetup(draft);
  if (!workplaceId) throw new Error('Workplace publication failed');
  return { kind: 'workplace_created', workplaceId };
}

export function applySetupOutcome(
  outcome: SetupOutcome,
  recipe: ReturnType<typeof getSetupRecipe>,
  onSwitchJourney: (journeyId: SetupJourneyId, name?: string) => void,
  candidateName?: string,
): void {
  if (outcome.kind === 'workplace_created') {
    AppNavigation.toDashboard();
    return;
  }
  if (outcome.kind === 'restore_accepted') {
    if (outcome.next === 'stay') AppNavigation.toSettings();
    else AppNavigation.toDashboard();
    return;
  }
  if (outcome.kind !== 'journey_discarded') return;
  if (recipe.discardTo === 'first_run') onSwitchJourney('first_run', candidateName);
  else if (recipe.discardTo === 'picker') AppNavigation.toDashboard();
  else if (recipe.discardTo === 'empty_device_workplace') {
    onSwitchJourney('empty_device_workplace');
  } else AppNavigation.toSettings();
}

export function restoreLeaveNeedsConfirm(draft: SetupDraft): boolean {
  return draft.kind === 'restore' && draft.restore.handoff !== undefined;
}

/** Delete unpublished restore books, drop the draft, then follow discardTo. */
export async function abandonRestoreJourney(
  draft: SetupDraft,
  recipe: ReturnType<typeof getSetupRecipe>,
  onSwitchJourney: (journeyId: SetupJourneyId, name?: string) => void,
): Promise<void> {
  await discardPublishedRestore(draft);
  clearSetupDraft();
  const candidateName = draft.kind === 'restore' ? draft.restore.deviceCandidate?.value : undefined;
  applySetupOutcome({ kind: 'journey_discarded' }, recipe, onSwitchJourney, candidateName);
}
