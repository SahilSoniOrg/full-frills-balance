import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useDashboardPreferences } from '@/src/hooks/useDashboardPreferences';
import { useProfilePrefs } from '@/src/hooks/useProfilePrefs';
import { useStsPreferences } from '@/src/hooks/useStsPreferences';
import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import type { PlainCurrency } from '@/src/types/domain';
import { analytics } from '@/src/services/analytics-service';
import { workplaceService } from '@/src/services/WorkplaceService';
import { useCallback } from 'react';

export interface PersonalizationViewModel {
  userName: string;
  setUserName: (value: string) => void;
  archetype: string;
  onUpdateArchetype: (id: string) => Promise<void>;
  workplaceCurrency: string;
  currencies: PlainCurrency[];
  workplaceName: string;
  onUpdateCurrency: (code: string) => Promise<void>;
  safeToSpendDays: number;
  setSafeToSpendDays: (days: number) => void;
  showSafeToSpendChart: boolean;
  setShowSafeToSpendChart: (show: boolean) => void;
}

export function usePersonalizationViewModel(): PersonalizationViewModel {
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { data: workplace } = useWorkplaceSnapshot(workplaceId);
  const { userName, archetype, updateUserDetails, setArchetype } = useProfilePrefs();
  const { safeToSpendDays, setSafeToSpendDays: setStsSafeToSpendDays } = useStsPreferences();
  const { showSafeToSpendChart, setShowSafeToSpendChart: setDashboardShowChart } =
    useDashboardPreferences();

  const workplaceName = workplace?.name ?? '';
  const { currencies } = useCurrencies();

  const setUserName = useCallback(
    (newName: string) => {
      if (newName.trim() && newName !== userName) {
        updateUserDetails(newName.trim(), archetype);
        analytics.trackFeatureUsage('settings', 'change_name', {
          name_length: newName.trim().length,
        });
      }
    },
    [archetype, updateUserDetails, userName],
  );

  const onUpdateArchetype = useCallback(
    async (id: string) => {
      setArchetype(id);
      analytics.trackFeatureUsage('settings', 'change_archetype', { archetype_id: id });
    },
    [setArchetype],
  );

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
      analytics.trackFeatureUsage('settings', 'change_safe_to_spend_days', {
        days: value,
      });
    },
    [setStsSafeToSpendDays],
  );

  const setShowSafeToSpendChart = useCallback(
    (show: boolean) => {
      setDashboardShowChart(show);
      analytics.trackFeatureUsage('settings', 'toggle_safe_to_spend_chart', {
        new_state: show,
      });
    },
    [setDashboardShowChart],
  );

  return {
    userName,
    setUserName,
    archetype,
    onUpdateArchetype,
    workplaceCurrency,
    currencies,
    workplaceName,
    onUpdateCurrency,
    safeToSpendDays,
    setSafeToSpendDays,
    showSafeToSpendChart,
    setShowSafeToSpendChart,
  };
}
