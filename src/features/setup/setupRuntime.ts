import { AppNavigation } from '@/src/utils/navigation';
import { publishRestore } from '@/src/services/import/publishRestore';
import { generator } from '@/src/data/database/idGenerator';
import { preferences } from '@/src/services/preferences';
import {
  createSetupCoordinator,
  createSetupDraft,
  type SetupCoordinator,
} from './SetupCoordinator';
import { loadPreparedRestores } from './pickRestoreSource';
import { getRestoreAutoOutput } from './restoreAutoOutput';
import {
  discardPublishedRestore,
  discardRestoredWorkplace,
  finishDeviceSetup,
  finishSetup,
} from './setupFinishers';
import { getSetupRecipe, recipeContainsSlice } from './setupRecipes';
import { clearSetupDraft, loadSetupDraft } from './SetupDraftStore';
import { restorePublicationClaims } from '@/src/services/import/restorePublicationClaims';
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
  return createSetupCoordinator({
    journeyId,
    operationId: draft.operationId,
    draft,
    resolution: { getAutoOutput: getRestoreAutoOutput },
    effects: {
      commitDevice: finishDeviceSetup,
      publishRestore: async restoreDraft => {
        const preparedRestores = await loadPreparedRestores(restoreDraft);
        const workplace = restoreDraft.workplace;
        if (!workplace) throw new Error('Workplace corrections are missing');
        const primary = await publishRestore(preparedRestores[0], {
          operationId: restoreDraft.operationId,
          corrections: {
            name: workplace.name.value,
            icon: workplace.icon.value,
            defaultCurrencyCode: workplace.baseCurrency.value,
          },
        });
        const sources = restoreDraft.restore.source?.batch ?? [];
        for (let index = 0; index < sources.length; index += 1) {
          const source = sources[index];
          const prepared = preparedRestores[index + 1];
          if (!source.operationId || !prepared) throw new Error('Bulk restore state is incomplete');
          const imported = source.facts.workplace;
          if (!imported.name || !imported.icon || !imported.defaultCurrencyCode) {
            throw new Error('Bulk restore workplace metadata is incomplete');
          }
          await publishRestore(prepared, {
            operationId: source.operationId,
            corrections: {
              name: imported.name,
              icon: imported.icon,
              defaultCurrencyCode: imported.defaultCurrencyCode,
            },
          });
        }
        return primary;
      },
      discardRestorePublication: async restoreDraft => {
        await discardPublishedRestore(restoreDraft);
        restorePublicationClaims.release(restoreDraft.operationId);
        for (const source of restoreDraft.restore.source?.batch ?? []) {
          if (!source.operationId) continue;
          await discardRestoredWorkplace(source.operationId);
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
    const isBulkRestore = (draft.restore.source?.batch?.length ?? 0) > 0;
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
