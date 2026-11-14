import { AppNavigation } from '@/src/navigation/AppNavigation';
import { publishRestore, restorePublicationClaims } from '@/src/services/import/restore';
import { generator } from '@/src/data/database/idGenerator';
import { asWorkplaceId, type WorkplaceId } from '@/src/types/ids';
import { workplaceService } from '@/src/services/WorkplaceService';
import {
  createSetupCoordinator,
  createSetupDraft,
  type SetupCoordinator,
} from './SetupCoordinator';
import { loadPreparedRestores } from './pickRestoreSource';
import { getRestoreAutoOutput } from './restoreAutoOutput';
import { discardRestorePublication, finishDeviceSetup, finishSetup } from './setupFinishers';
import { getSetupRecipe } from './setupRecipes';
import { clearSetupDraft, loadSetupDraft } from './SetupDraftStore';
import { restoreSources, type RestoreJourneyId, type RestoreSetupDraft } from './setupTypes';

type RestoreSetupOutcome =
  | {
      readonly kind: 'restore_accepted';
      readonly workplaceId: WorkplaceId;
      readonly next: 'open' | 'stay' | 'picker';
    }
  | { readonly kind: 'journey_discarded' };

export function resolveOptionalJourney(params: {
  mode?: string;
  journey?: string;
}): RestoreJourneyId | undefined {
  switch (params.journey) {
    case 'first_run_restore':
    case 'empty_device_restore':
    case 'picker_restore':
    case 'settings_restore':
      return params.journey;
    default:
      return undefined;
  }
}

/** A completed first-run restore can briefly remain on its old route. */
export function shouldExitCompletedFirstRunRestore(
  journey: string | undefined,
  hasDraft: boolean,
  deviceRegistered: boolean,
): boolean {
  return journey === 'first_run_restore' && !hasDraft && deviceRegistered;
}

export function resolveSetupJourney(
  params: { mode?: string; journey?: string },
  override?: RestoreJourneyId,
): RestoreJourneyId | undefined {
  if (override) return override;
  const draft = loadSetupDraft();
  if (draft?.kind === 'restore' && draft.entryPolicy === 'blocking') {
    return draft.journeyId;
  }
  if (draft?.kind === 'restore') return draft.journeyId;
  return resolveOptionalJourney(params);
}

export function createJourneyCoordinator(journeyId: RestoreJourneyId): SetupCoordinator {
  const existing = loadSetupDraft();
  const draft =
    existing?.kind === 'restore' && existing.journeyId === journeyId
      ? existing
      : createSeededDraft(journeyId);
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
            const publishedName = await uniqueRestoreWorkplaceName(corrections.name, operationId);
            const handoff = await publishRestore(prepared, {
              operationId,
              corrections: { ...corrections, name: publishedName },
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
    finish: finishJourney,
  });
}

async function uniqueRestoreWorkplaceName(
  requestedName: string,
  operationId: WorkplaceId,
): Promise<string> {
  const name = requestedName.trim();
  const existing = await workplaceService.getAllWorkplaces();
  // Reuse the committed name if publication already happened before an interrupted retry.
  const alreadyPublished = existing.find(workplace => workplace.id === operationId);
  if (alreadyPublished) return alreadyPublished.name;

  const existingNames = new Set(
    existing
      .filter(workplace => workplace.id !== operationId)
      .map(workplace => workplace.name.trim().toLowerCase()),
  );
  if (!existingNames.has(name.toLowerCase())) return name;

  let suffix = 2;
  let candidate = `${name} (${suffix})`;
  while (existingNames.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${name} (${suffix})`;
  }
  return candidate;
}

function createSeededDraft(journeyId: RestoreJourneyId): RestoreSetupDraft {
  return createSetupDraft(journeyId, asWorkplaceId(generator()));
}

async function finishJourney(draft: RestoreSetupDraft): Promise<RestoreSetupOutcome> {
  const intent = draft.restore.summary?.intent ?? 'continue';
  const isBulkRestore = restoreSources(draft).length > 1;
  const workplaceId = await finishSetup(draft, {
    activate: !isBulkRestore && (intent === 'open' || intent === 'continue'),
  });
  if (!workplaceId) throw new Error('Restore publication is incomplete');
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

export function applySetupOutcome(
  outcome: RestoreSetupOutcome,
  recipe: ReturnType<typeof getSetupRecipe>,
  candidateName?: string,
  returnToWorkplacePicker: () => void = AppNavigation.toDashboard,
): void {
  if (outcome.kind === 'restore_accepted') {
    if (outcome.next === 'picker') returnToWorkplacePicker();
    else if (outcome.next === 'stay') AppNavigation.returnToSettings();
    else AppNavigation.toDashboard();
    return;
  }
  if (outcome.kind !== 'journey_discarded') return;
  if (recipe.discardTo === 'first_run') AppNavigation.toFirstRun(candidateName);
  else if (recipe.discardTo === 'back') AppNavigation.back();
  else if (recipe.discardTo === 'picker') AppNavigation.toDashboard();
  else if (recipe.discardTo === 'add_workplace') {
    AppNavigation.toAddWorkplace({
      context: 'registered_empty_device',
      origin: '/onboarding?journey=empty_device_restore',
      navigation: 'replace',
    });
  } else if (recipe.discardTo === 'settings') AppNavigation.returnToSettings();
  else AppNavigation.returnToSettings();
}

export function restoreLeaveNeedsConfirm(draft: RestoreSetupDraft): boolean {
  return (draft.restore.handoffs?.length ?? 0) > 0;
}

/** Delete unpublished restore books, drop the draft, then follow discardTo. */
export async function abandonRestoreJourney(
  draft: RestoreSetupDraft,
  recipe: ReturnType<typeof getSetupRecipe>,
): Promise<void> {
  await discardRestorePublication(draft);
  clearSetupDraft();
  applySetupOutcome({ kind: 'journey_discarded' }, recipe, draft.restore.deviceCandidate?.value);
}
