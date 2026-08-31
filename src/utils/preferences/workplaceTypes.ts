import { AppConfig } from '@/src/constants/app-config';
import { AccountId } from '@/src/types/ids';

/** Settings that change what a workplace's books mean or write. */
export interface WorkplacePreferences {
  lastSelectedAccountId?: AccountId;
  lastDateRange?: {
    startDate: number;
    endDate: number;
  };
  lastUsedSourceAccountId?: AccountId;
  lastUsedDestinationAccountId?: AccountId;
  dismissedPatternIds: string[];
  safeToSpendDays: number;
}

export const DEFAULT_WORKPLACE_PREFERENCES: WorkplacePreferences = {
  dismissedPatternIds: [],
  safeToSpendDays: AppConfig.defaults.safeToSpendDays,
};

export const WORKPLACE_PREFERENCE_KEYS = [
  'lastSelectedAccountId',
  'lastDateRange',
  'lastUsedSourceAccountId',
  'lastUsedDestinationAccountId',
  'dismissedPatternIds',
  'safeToSpendDays',
] as const;

export type WorkplacePreferenceKey = (typeof WORKPLACE_PREFERENCE_KEYS)[number];

export const WORKPLACE_PREFERENCES_KEY_PREFIX = 'full_frills_balance_workplace_prefs:';

export function workplacePreferencesStorageKey(workplaceId: string): string {
  return `${WORKPLACE_PREFERENCES_KEY_PREFIX}${workplaceId}`;
}
