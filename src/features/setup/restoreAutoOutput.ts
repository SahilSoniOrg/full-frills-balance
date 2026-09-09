import { isValidIconName } from '@/src/types/domainIcons';
import { FontIds, ThemeIds } from '@/src/constants/design-tokens';
import {
  primaryRestoreSource,
  type AppearanceSetupOutput,
  type DeviceSetupOutput,
  type SetupDraft,
  type SetupSliceId,
  type SetupSliceOutput,
  type WorkplaceSetupOutput,
  type WorkplaceSetupPrefill,
} from './setupTypes';

export function getRestoreAutoOutput(
  sliceId: SetupSliceId,
  draft: SetupDraft,
): SetupSliceOutput | undefined {
  if (draft.kind !== 'restore') return undefined;
  const facts = primaryRestoreSource(draft)?.facts;
  if (!facts) return undefined;
  if (sliceId === 'workplace') return workplaceFromFacts(facts.workplace);
  if (sliceId === 'device') {
    return deviceFromFacts(facts.user?.name, draft.restore.deviceCandidate?.value);
  }
  return undefined;
}

/** Prefill imported identity/currency even when the slice still must be presented. */
export function getRestoreWorkplacePrefill(draft: SetupDraft): WorkplaceSetupPrefill | undefined {
  if (draft.kind !== 'restore') return undefined;
  const workplace = primaryRestoreSource(draft)?.facts.workplace;
  if (!workplace) return undefined;
  const prefill = workplacePrefill(workplace);
  return prefill.name || prefill.icon || prefill.baseCurrency ? prefill : undefined;
}

export function getRestoreAppearancePrefill(draft: SetupDraft): AppearanceSetupOutput | undefined {
  if (draft.kind !== 'restore') return undefined;
  const appearance = primaryRestoreSource(draft)?.facts.appearance;
  if (!appearance?.themeId && !appearance?.fontId) return undefined;
  return {
    themeId: {
      value: appearance.themeId ?? ThemeIds.DEEP_SPACE,
      source: appearance.themeId ? 'imported' : 'defaulted',
    },
    fontId: {
      value: appearance.fontId ?? FontIds.DEEP_SPACE,
      source: appearance.fontId ? 'imported' : 'defaulted',
    },
  };
}

function workplacePrefill(workplace: {
  readonly name?: string;
  readonly icon?: string;
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
  readonly icon?: string;
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
): DeviceSetupOutput | undefined {
  const imported = importedName?.trim();
  if (imported) return { displayName: { value: imported, source: 'imported' } };
  const candidate = candidateName?.trim();
  if (candidate) return { displayName: { value: candidate, source: 'user_entered' } };
  return undefined;
}
