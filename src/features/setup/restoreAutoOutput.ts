import { isValidIconName, type IconName } from '@/src/types/domainIcons';
import type {
  DeviceSetupOutput,
  SetupDraft,
  SetupSliceId,
  SetupSliceOutput,
  WorkplaceSetupOutput,
  WorkplaceSetupPrefill,
} from './setupTypes';

export function getRestoreAutoOutput(
  sliceId: SetupSliceId,
  draft: SetupDraft,
  existing: { readonly userName?: string; readonly candidateName?: string } = {},
): SetupSliceOutput | undefined {
  if (draft.kind !== 'restore') return undefined;
  const facts = draft.restore.source?.facts;
  if (!facts) return undefined;
  if (sliceId === 'workplace') return workplaceFromFacts(facts.workplace);
  if (sliceId === 'device') {
    return deviceFromFacts(facts.user?.name, existing.candidateName, existing.userName);
  }
  return undefined;
}

/** Prefill imported identity/currency even when the slice still must be presented. */
export function getRestoreWorkplacePrefill(draft: SetupDraft): WorkplaceSetupPrefill | undefined {
  if (draft.kind !== 'restore') return undefined;
  const workplace = draft.restore.source?.facts.workplace;
  if (!workplace) return undefined;
  const prefill = workplacePrefill(workplace);
  return prefill.name || prefill.icon || prefill.baseCurrency ? prefill : undefined;
}

function workplacePrefill(workplace: {
  readonly name?: string;
  readonly icon?: IconName | string;
  readonly defaultCurrencyCode?: string;
}): WorkplaceSetupPrefill {
  const name = workplace.name?.trim();
  const icon =
    typeof workplace.icon === 'string' && isValidIconName(workplace.icon)
      ? workplace.icon
      : undefined;
  const currency = workplace.defaultCurrencyCode?.trim().toUpperCase();
  return {
    ...(name ? { name: { value: name, source: 'imported' as const } } : {}),
    ...(icon ? { icon: { value: icon, source: 'imported' as const } } : {}),
    ...(currency ? { baseCurrency: { value: currency, source: 'imported' as const } } : {}),
  };
}

function workplaceFromFacts(workplace: {
  readonly name?: string;
  readonly icon?: IconName | string;
  readonly defaultCurrencyCode?: string;
}): WorkplaceSetupOutput | undefined {
  const prefill = workplacePrefill(workplace);
  if (!prefill.name || !prefill.icon || !prefill.baseCurrency) return undefined;
  return {
    name: prefill.name,
    icon: prefill.icon,
    baseCurrency: prefill.baseCurrency,
    selectedAccounts: [],
    selectedCategories: [],
    acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
  };
}

function deviceFromFacts(
  importedName: string | undefined,
  candidateName: string | undefined,
  existingName: string | undefined,
): DeviceSetupOutput | undefined {
  const imported = importedName?.trim();
  if (imported) return { displayName: { value: imported, source: 'imported' } };
  const candidate = candidateName?.trim();
  if (candidate) return { displayName: { value: candidate, source: 'user_entered' } };
  const existing = existingName?.trim();
  if (existing) return { displayName: { value: existing, source: 'existing' } };
  return undefined;
}
