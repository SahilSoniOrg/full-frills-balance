import { isValidIconName, type IconName } from '@/src/types/domainIcons';
import type {
  DeviceSetupOutput,
  SetupDraft,
  SetupSliceId,
  SetupSliceOutput,
  WorkplaceSetupOutput,
} from './setupTypes';

export function getRestoreAutoOutput(
  sliceId: SetupSliceId,
  draft: SetupDraft,
  existing: { readonly userName?: string } = {},
): SetupSliceOutput | undefined {
  if (draft.kind !== 'restore') return undefined;
  const facts = draft.restore.source?.facts;
  if (!facts) return undefined;
  if (sliceId === 'workplace') return workplaceFromFacts(facts.workplace);
  if (sliceId === 'device') return deviceFromFacts(facts.user?.name, existing.userName);
  return undefined;
}

function workplaceFromFacts(workplace: {
  readonly name?: string;
  readonly icon?: IconName | string;
  readonly defaultCurrencyCode?: string;
}): WorkplaceSetupOutput | undefined {
  const name = workplace.name?.trim();
  const icon =
    typeof workplace.icon === 'string' && isValidIconName(workplace.icon)
      ? workplace.icon
      : undefined;
  const currency = workplace.defaultCurrencyCode?.trim().toUpperCase();
  if (!name || !icon || !currency) return undefined;
  return {
    name: { value: name, source: 'imported' },
    icon: { value: icon, source: 'imported' },
    baseCurrency: { value: currency, source: 'imported' },
    selectedAccounts: [],
    selectedCategories: [],
    acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
  };
}

function deviceFromFacts(
  importedName: string | undefined,
  existingName: string | undefined,
): DeviceSetupOutput | undefined {
  const imported = importedName?.trim();
  if (imported) return { displayName: { value: imported, source: 'imported' } };
  const existing = existingName?.trim();
  if (existing) return { displayName: { value: existing, source: 'existing' } };
  return undefined;
}
