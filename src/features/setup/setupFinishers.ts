import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { AccountType } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import { workplaceService } from '@/src/services/WorkplaceService';
import { preferences } from '@/src/services/preferences';
import { generateWorkplaceName } from '@/src/utils/workplaceName';
import { claimedRestoreFingerprint, isRestoreOwnershipTuple } from '@/src/services/import/restore';
import type {
  AppearanceSetupOutput,
  DeviceSetupOutput,
  RestoreSetupDraft,
  SetupDraft,
  WorkplaceSetupOutput,
} from './setupTypes';
import { primaryRestoreSource, restoreSources } from './setupTypes';

function starterAccounts(output: WorkplaceSetupOutput) {
  return output.selectedAccounts.map(item => {
    const preset = DEFAULT_ACCOUNTS.find(
      candidate => candidate.name.toLowerCase() === item.name.toLowerCase(),
    );
    return {
      name: item.name,
      type: preset?.type ?? item.type,
      icon: preset?.icon ?? item.icon,
    };
  });
}

function starterCategories(output: WorkplaceSetupOutput) {
  return output.selectedCategories.map(item => {
    const preset = DEFAULT_CATEGORIES.find(
      candidate => candidate.name.toLowerCase() === item.name.toLowerCase(),
    );
    return {
      name: item.name,
      type:
        preset === undefined
          ? item.type
          : preset.type === 'INCOME'
            ? AccountType.INCOME
            : AccountType.EXPENSE,
      icon: preset?.icon ?? item.icon,
    };
  });
}

async function uniqueDefaultWorkplaceName(output: WorkplaceSetupOutput): Promise<string> {
  const name = output.name.value.trim();
  if (output.name.source !== 'defaulted') return name;

  const existingNames = new Set(
    (await workplaceService.getAllWorkplaces()).map(workplace => workplace.name.toLowerCase()),
  );
  if (!existingNames.has(name.toLowerCase())) return name;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateWorkplaceName();
    if (!existingNames.has(candidate.toLowerCase())) return candidate;
  }

  let suffix = 2;
  while (existingNames.has(`${name} ${suffix}`.toLowerCase())) suffix += 1;
  return `${name} ${suffix}`;
}

/** Device writes happen once, at the Device slice checkpoint. */
export function finishDeviceSetup(output: DeviceSetupOutput): void {
  const name = output.displayName.value.trim();
  if (!name) throw new Error('Display name is required');
  preferences.setUserName(name);
  preferences.device.setDeviceRegistered(true);
}

/** Appearance is global User preference, applied only after explicit acceptance. */
export function finishAppearanceSetup(output: AppearanceSetupOutput): void {
  preferences.themePrefs.setThemeId(output.themeId.value);
  preferences.themePrefs.setFontId(output.fontId.value);
}

/** Publish a fresh Workplace atomically. Repeating operationId is safe. */
export async function finishWorkplaceSetup(
  operationId: WorkplaceId,
  output: WorkplaceSetupOutput,
): Promise<WorkplaceId> {
  const name = await uniqueDefaultWorkplaceName(output);
  const workplace = await workplaceService.createWorkplace(name, output.icon.value, {
    id: operationId,
    currencyCode: output.baseCurrency.value,
    initialAccounts: starterAccounts(output),
    initialCategories: starterCategories(output),
  });
  return workplace.id;
}

export interface FinishSetupOptions {
  readonly activate?: boolean;
  readonly applyAppearance?: boolean;
}

async function publishedRestoreWorkplace(draft: SetupDraft) {
  if (draft.kind !== 'restore') return undefined;
  const handoff = draft.restore.handoffs?.[0];
  if (!handoff) return undefined;
  if (
    !isRestoreOwnershipTuple({
      operationId: draft.operationId,
      sourceFingerprint: primaryRestoreSource(draft)?.source.fingerprint,
      handoff,
      claimedFingerprint: claimedRestoreFingerprint(draft.operationId),
    })
  ) {
    return undefined;
  }
  try {
    const workplace = await workplaceService.getWorkplace(handoff.workplaceId);
    if (!workplace || workplace.id !== draft.operationId) return undefined;
    return { handoff, workplace };
  } catch (error) {
    throw new Error('Could not verify the published restore workplace', { cause: error });
  }
}

export type RestoreSummaryView = {
  readonly name: string;
  readonly icon: string;
  readonly currency: string;
  readonly accounts: number;
  readonly categories: number;
  readonly journals: number;
};

export async function loadRestoreSummaries(
  draft: RestoreSetupDraft,
): Promise<readonly RestoreSummaryView[] | undefined> {
  const published = await publishedRestoreWorkplace(draft);
  if (!published) return undefined;
  const sources = restoreSources(draft);
  const summaries: RestoreSummaryView[] = [];

  for (const [index, source] of sources.entries()) {
    const workplaceId = index === 0 ? published.workplace.id : source?.operationId;
    if (!workplaceId) return undefined;
    const workplace =
      index === 0 ? published.workplace : await workplaceService.getWorkplace(workplaceId);
    if (!workplace) return undefined;
    const stats = await workplaceService.getPublishedBookStats(workplace.id);
    summaries.push({
      name: workplace.name,
      icon: workplace.icon,
      currency: workplace.defaultCurrencyCode,
      accounts: stats.accounts,
      categories: stats.categories,
      journals: stats.journals,
    });
  }

  return summaries;
}

export async function loadRestoreSummary(
  draft: SetupDraft,
): Promise<RestoreSummaryView | undefined> {
  if (draft.kind !== 'restore') return undefined;
  return (await loadRestoreSummaries(draft))?.[0];
}

/** Delete only this operation's inactive published Workplace, after the caller confirmed. */
export async function discardPublishedRestore(draft: SetupDraft): Promise<void> {
  const published = await publishedRestoreWorkplace(draft);
  if (!published) return;
  if (published.workplace.id !== draft.operationId) return;
  if (preferences.device.activeWorkplaceId === published.workplace.id) return;
  await workplaceService.deleteWorkplace(published.workplace.id);
}

/** Delete an unpublished bulk-restore workplace by its stable operation ID. */
export async function discardRestoredWorkplace(workplaceId: WorkplaceId): Promise<void> {
  if (preferences.device.activeWorkplaceId === workplaceId) return;
  const workplace = await workplaceService.getWorkplace(workplaceId);
  if (workplace) await workplaceService.deleteWorkplace(workplaceId);
}

/** Delete every unpublished workplace produced by a restore, including a partial batch. */
export async function discardRestorePublication(draft: RestoreSetupDraft): Promise<void> {
  const published = await publishedRestoreWorkplace(draft);
  const sources = restoreSources(draft);
  const primary = sources[0];
  if (published) {
    await discardPublishedRestore(draft);
  } else if (
    primary?.source.fingerprint &&
    claimedRestoreFingerprint(draft.operationId) === primary.source.fingerprint
  ) {
    // The publication effect may have failed before its handoff was persisted.
    await discardRestoredWorkplace(draft.operationId);
  }
  for (const source of sources.slice(1)) {
    if (source.operationId) await discardRestoredWorkplace(source.operationId);
  }
}

/** Terminal finisher used by the coordinator after Summary acceptance. */
export async function finishSetup(
  draft: SetupDraft,
  options: FinishSetupOptions = {},
): Promise<WorkplaceId | undefined> {
  if (draft.kind === 'restore') {
    const published = await publishedRestoreWorkplace(draft);
    if (!published) throw new Error('Restore publication is incomplete');
    const sources = restoreSources(draft);
    const persistedHandoffs = draft.restore.handoffs;
    if (!persistedHandoffs || persistedHandoffs.length !== sources.length) {
      throw new Error('Restore publication is incomplete');
    }
    for (const source of sources.slice(1)) {
      if (!source.operationId || !(await workplaceService.getWorkplace(source.operationId))) {
        throw new Error('Bulk restore workplace is no longer available');
      }
    }
    const { workplace } = published;
    if (draft.workplace) {
      const name = draft.workplace.name.value.trim();
      const icon = draft.workplace.icon.value;
      if (name !== workplace.name || icon !== workplace.icon) {
        await workplaceService.updateWorkplace(workplace.id, {
          ...(name !== workplace.name ? { name } : {}),
          ...(icon !== workplace.icon ? { icon } : {}),
        });
      }
    }
    if (options.applyAppearance && draft.appearance) finishAppearanceSetup(draft.appearance);
    if (options.activate !== false) preferences.device.setActiveWorkplaceId(workplace.id);
    return workplace.id;
  }

  if (!draft.workplace) throw new Error('Workplace setup is incomplete');
  const workplaceId = await finishWorkplaceSetup(draft.operationId, draft.workplace);
  if (draft.kind === 'first_run' && options.applyAppearance !== false && draft.appearance) {
    finishAppearanceSetup(draft.appearance);
  }
  if (options.activate !== false) preferences.device.setActiveWorkplaceId(workplaceId);
  return workplaceId;
}
