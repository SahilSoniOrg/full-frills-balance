import { AppNavigation } from '@/src/utils/navigation';
import { publishRestore, restorePublicationClaims } from '@/src/services/import/restore';
import { generator } from '@/src/data/database/idGenerator';
import { preferences } from '@/src/services/preferences';
import { workplaceService } from '@/src/services/WorkplaceService';
import {
  createSetupCoordinator,
  createSetupDraft,
  type SetupCoordinator,
} from './SetupCoordinator';
import { loadPreparedRestores } from './pickRestoreSource';
import { getRestoreAutoOutput } from './restoreAutoOutput';
import { discardRestorePublication, finishDeviceSetup, finishSetup } from './setupFinishers';
import { getSetupRecipe, recipeContainsSlice } from './setupRecipes';
import { clearSetupDraft, loadSetupDraft } from './SetupDraftStore';
import {
  isSetupJourneyId,
  restoreSources,
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
  return createSetupCoordinator({
    journeyId,
    operationId: draft.operationId,
    draft,
    resolution: { getAutoOutput: getRestoreAutoOutput },
    effects: {
      commitDevice: finishDeviceSetup,
      publishRestore: async (restoreDraft, onProgress) => {
        const preparedRestores = await loadPreparedRestores(restoreDraft);
        const workplace = restoreDraft.workplace;
        if (!workplace) throw new Error('Workplace corrections are missing');
        const sources = restoreSources(restoreDraft);
        if (preparedRestores.length !== sources.length) {
          throw new Error('Bulk restore state is incomplete');
        }
        try {
          const handoffs = [];
          for (let index = 0; index < sources.length; index += 1) {
            const source = sources[index];
            const prepared = preparedRestores[index];
            if (!prepared) throw new Error('Bulk restore state is incomplete');
            const operationId = index === 0 ? restoreDraft.operationId : source.operationId;
            if (!operationId) throw new Error('Bulk restore state is incomplete');
            const imported = source.facts.workplace;
            const corrections =
              index === 0
                ? {
                    name: workplace.name.value,
                    icon: workplace.icon.value,
                    defaultCurrencyCode: workplace.baseCurrency.value,
                  }
                : imported.name && imported.icon && imported.defaultCurrencyCode
                  ? {
                      name: imported.name,
                      icon: imported.icon,
                      defaultCurrencyCode: imported.defaultCurrencyCode,
                    }
                  : undefined;
            if (!corrections) throw new Error('Bulk restore workplace metadata is incomplete');
            const handoff = await publishRestore(prepared, {
              operationId,
              corrections,
              onProgress,
            });
            if (index > 0 && !(await workplaceService.getWorkplace(operationId))) {
              throw new Error(`Restored workplace was not saved: ${imported.name}`);
            }
            handoffs.push(handoff);
          }
          return handoffs;
        } catch (error) {
          await discardRestorePublication(restoreDraft).catch(() => undefined);
          throw error;
        }
      },
      discardRestorePublication: async restoreDraft => {
        await discardRestorePublication(restoreDraft);
        restorePublicationClaims.release(restoreDraft.operationId);
        for (const source of restoreSources(restoreDraft)) {
          if (!source.operationId) continue;
          restorePublicationClaims.release(source.operationId);
        }
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
    const isBulkRestore = restoreSources(draft).length > 1;
    const workplaceId = await finishSetup(draft, {
      activate: !isBulkRestore && (intent === 'open' || intent === 'continue'),
      applyAppearance,
    });
    if (!workplaceId) throw new Error('Restore publication is incomplete');
    if (isBulkRestore) preferences.device.setActiveWorkplaceId(undefined);
    return {
      kind: 'restore_accepted',
      workplaceId,
      next: isBulkRestore
        ? 'picker'
        : intent === 'stay'
          ? 'stay'
          : intent === 'return_to_picker'
            ? 'picker'
            : 'open',
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
  return draft.kind === 'restore' && (draft.restore.handoffs?.length ?? 0) > 0;
}

/** Delete unpublished restore books, drop the draft, then follow discardTo. */
export async function abandonRestoreJourney(
  draft: SetupDraft,
  recipe: ReturnType<typeof getSetupRecipe>,
  onSwitchJourney: (journeyId: SetupJourneyId, name?: string) => void,
): Promise<void> {
  if (draft.kind === 'restore') await discardRestorePublication(draft);
  clearSetupDraft();
  const candidateName = draft.kind === 'restore' ? draft.restore.deviceCandidate?.value : undefined;
  applySetupOutcome({ kind: 'journey_discarded' }, recipe, onSwitchJourney, candidateName);
}
