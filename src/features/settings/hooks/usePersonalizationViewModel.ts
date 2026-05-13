import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { analytics } from '@/src/services/analytics-service';
import { workplaceService } from '@/src/services/WorkplaceService';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useCallback, useEffect, useState } from 'react';
import Currency from '@/src/data/models/Currency';

export interface PersonalizationViewModel {
  userName: string;
  setUserName: (value: string) => void;
  archetype: string;
  onUpdateArchetype: (id: string) => Promise<void>;
  workplaceCurrency: string;
  currencies: Currency[];
  workplaceName: string;
  onUpdateCurrency: (code: string) => Promise<void>;
  safeToSpendDays: number;
  setSafeToSpendDays: (days: number) => void;
}

export function usePersonalizationViewModel(): PersonalizationViewModel {
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const ui = useUI();
  const {
    userName,
    updateUserDetails,
    archetype,
    setArchetype,
    safeToSpendDays,
    setSafeToSpendDays: setUiSafeToSpendDays,
  } = ui;

  const [workplaceName, setWorkplaceName] = useState('');
  const { currencies } = useCurrencies();

  useEffect(() => {
    const sub = workplaceService.observeWorkplace(workplaceId).subscribe(w => {
      if (w) setWorkplaceName(w.name);
    });
    return () => sub.unsubscribe();
  }, [workplaceId]);

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
      await setArchetype(id);
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
      setUiSafeToSpendDays(value);
      analytics.trackFeatureUsage('settings', 'change_safe_to_spend_days', {
        days: value,
      });
    },
    [setUiSafeToSpendDays],
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
  };
}
