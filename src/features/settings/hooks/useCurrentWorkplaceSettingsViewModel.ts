import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useStsPreferences } from '@/src/hooks/useStsPreferences';
import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { analytics } from '@/src/services/analytics';
import { workplaceService } from '@/src/services/WorkplaceService';
import type { IconName } from '@/src/types/domainIcons';
import type { PlainCurrency, PlainWorkplace } from '@/src/types/plainDtos';
import { toast } from '@/src/utils/alerts';
import { useCallback } from 'react';

export interface CurrentWorkplaceSettingsViewModel {
  activeWorkplace: PlainWorkplace | undefined;
  updateWorkplaceDetails: (name: string, icon: IconName) => Promise<boolean>;
  workplaceName: string;
  workplaceCurrency: string;
  currencies: PlainCurrency[];
  onUpdateCurrency: (code: string) => Promise<void>;
  safeToSpendDays: number;
  setSafeToSpendDays: (days: number) => void;
}

export function useCurrentWorkplaceSettingsViewModel(): CurrentWorkplaceSettingsViewModel {
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { data: workplace } = useWorkplaceSnapshot(workplaceId);
  const { currencies } = useCurrencies();
  const { safeToSpendDays, setSafeToSpendDays: setStsSafeToSpendDays } = useStsPreferences();

  const onUpdateCurrency = useCallback(
    async (code: string) => {
      await workplaceService.updateWorkplace(workplaceId, { defaultCurrencyCode: code });
      analytics.trackFeatureUsage('settings', 'change_currency', { currency_code: code });
    },
    [workplaceId],
  );

  const setSafeToSpendDays = useCallback(
    (value: number) => {
      setStsSafeToSpendDays(value);
      analytics.trackFeatureUsage('settings', 'change_safe_to_spend_days', { days: value });
    },
    [setStsSafeToSpendDays],
  );

  const updateWorkplaceDetails = useCallback(
    async (name: string, icon: IconName) => {
      try {
        await workplaceService.updateWorkplace(workplaceId, { name, icon });
        analytics.trackFeatureUsage('settings', 'update_workplace_icon', { icon });
        return true;
      } catch {
        toast.error('Failed to update workplace.');
        return false;
      }
    },
    [workplaceId],
  );

  return {
    activeWorkplace: workplace ?? undefined,
    updateWorkplaceDetails,
    workplaceName: workplace?.name ?? '',
    workplaceCurrency,
    currencies,
    onUpdateCurrency,
    safeToSpendDays,
    setSafeToSpendDays,
  };
}
