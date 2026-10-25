import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useStsPreferences } from '@/src/hooks/useStsPreferences';
import { analytics } from '@/src/services/analytics';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AppConfig } from '@/src/constants/app-config';
import type { IconName } from '@/src/types/domainIcons';
import type { PlainCurrency, PlainWorkplace } from '@/src/types/plainDtos';
import { confirm, toast } from '@/src/utils/alerts';
import { useCallback, useState } from 'react';

export interface WorkplaceSettingsViewModel {
  activeWorkplace: PlainWorkplace;
  workplaceCurrency: string;
  currencies: PlainCurrency[];
  onUpdateCurrency: (code: string) => Promise<void>;
  safeToSpendDays: number;
  setSafeToSpendDays: (days: number) => void;
  updateWorkplaceDetails: (name: string, icon: IconName) => Promise<boolean>;
  deleteWorkplace: () => void;
  deletingWorkplaceId: string | null;
}

export function useWorkplaceSettingsViewModel(): WorkplaceSettingsViewModel {
  const {
    workplaceId: activeWorkplaceId,
    defaultCurrencyCode: workplaceCurrency,
    deleteWorkplace: deleteActiveWorkplace,
    activeWorkplace,
  } = useWorkplace();
  const { currencies } = useCurrencies();
  const { safeToSpendDays, setSafeToSpendDays: setStsSafeToSpendDays } = useStsPreferences();
  const [deletingWorkplaceId, setDeletingWorkplaceId] = useState<string | null>(null);

  const onUpdateCurrency = useCallback(
    async (code: string) => {
      await workplaceService.updateWorkplace(activeWorkplaceId, { defaultCurrencyCode: code });
      analytics.trackFeatureUsage('settings', 'change_currency', { currency_code: code });
    },
    [activeWorkplaceId],
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
        await workplaceService.updateWorkplace(activeWorkplaceId, { name, icon });
        analytics.trackFeatureUsage('settings', 'update_workplace_icon', { icon });
        return true;
      } catch {
        toast.error('Failed to update workplace.');
        return false;
      }
    },
    [activeWorkplaceId],
  );

  const deleteWorkplace = useCallback(async () => {
    let isLast = false;
    try {
      const workplaces = await workplaceService.getAllWorkplaces();
      if (!workplaces.some(workplace => workplace.id === activeWorkplace.id)) {
        toast.error('This workplace could not be found. Please try again.');
        return;
      }
      isLast = workplaces.length === 1;
    } catch {
      toast.error('Failed to load workplaces. Please try again.');
      return;
    }
    confirm.show({
      title: AppConfig.strings.settings.workplaceManagement.deleteTitle,
      message: AppConfig.strings.settings.workplaceManagement.deleteMessage(
        activeWorkplace.name,
        isLast,
      ),
      confirmText: AppConfig.strings.settings.workplaceManagement.deleteConfirm,
      destructive: true,
      requiredConfirmationValue: activeWorkplace.name,
      onConfirm: async () => {
        setDeletingWorkplaceId(activeWorkplace.id);
        try {
          const result = await deleteActiveWorkplace(activeWorkplace.id);
          if (result.status === 'committed_with_warnings') {
            toast.warning('Workplace deleted, but some cleanup will be retried.');
          } else {
            toast.success('Workplace deleted.');
          }
        } catch {
          toast.error('Failed to delete workplace. Your books were not changed.');
        } finally {
          setDeletingWorkplaceId(null);
        }
      },
    });
  }, [activeWorkplace, deleteActiveWorkplace]);

  return {
    activeWorkplace,
    workplaceCurrency,
    currencies,
    onUpdateCurrency,
    safeToSpendDays,
    setSafeToSpendDays,
    updateWorkplaceDetails,
    deleteWorkplace,
    deletingWorkplaceId,
  };
}
