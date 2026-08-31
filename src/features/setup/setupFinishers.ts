import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { AccountType } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import { workplaceService } from '@/src/services/WorkplaceService';
import { preferences } from '@/src/utils/preferences';
import type {
  AppearanceSetupOutput,
  DeviceSetupOutput,
  SetupDraft,
  WorkplaceSetupOutput,
} from './setupTypes';

function starterAccounts(output: WorkplaceSetupOutput) {
  return output.selectedAccounts.map(item => {
    const preset = DEFAULT_ACCOUNTS.find(
      candidate => candidate.name.toLowerCase() === item.name.toLowerCase(),
    );
    return {
      name: item.name,
      type: (preset?.type ?? item.type) as AccountType,
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
      type: (preset?.type ?? item.type) as AccountType,
      icon: preset?.icon ?? item.icon,
    };
  });
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
  const workplace = await workplaceService.createWorkplace(output.name.value, output.icon.value, {
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

/** Terminal finisher used by the coordinator after Summary acceptance. */
export async function finishSetup(
  draft: SetupDraft,
  options: FinishSetupOptions = {},
): Promise<WorkplaceId | undefined> {
  if (draft.kind === 'restore') {
    const workplaceId = draft.restore.handoff?.workplaceId;
    if (!workplaceId) throw new Error('Restore publication is incomplete');
    if (draft.device) finishDeviceSetup(draft.device);
    if (options.applyAppearance && draft.appearance) finishAppearanceSetup(draft.appearance);
    if (options.activate !== false) preferences.device.setActiveWorkplaceId(workplaceId);
    return workplaceId;
  }

  if (!draft.workplace) throw new Error('Workplace setup is incomplete');
  const workplaceId = await finishWorkplaceSetup(draft.operationId, draft.workplace);
  if (draft.kind === 'first_run' && draft.device) finishDeviceSetup(draft.device);
  if (draft.kind === 'first_run' && options.applyAppearance !== false && draft.appearance) {
    finishAppearanceSetup(draft.appearance);
  }
  if (options.activate !== false) preferences.device.setActiveWorkplaceId(workplaceId);
  return workplaceId;
}
