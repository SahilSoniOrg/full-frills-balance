import { IconName } from '@/src/components/core';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AccountType, PlainWorkplace } from '@/src/types/domain';
import { useObservable } from '@/src/hooks/useObservable';
import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { analytics } from '@/src/services/analytics';
import { workplaceService } from '@/src/services/WorkplaceService';
import { toast } from '@/src/utils/alerts';
import { useCallback, useState } from 'react';

export interface WorkplaceSettingsViewModel {
  workplaces: PlainWorkplace[];
  activeWorkplace: PlainWorkplace | undefined;
  isCreating: boolean;
  isCreatingWorkplace: boolean;
  setActiveWorkplace: (workplace: PlainWorkplace) => void;
  createWorkplace: (
    name: string,
    icon: IconName,
    options: {
      initialAccounts?: { name: string; type: AccountType; icon: IconName }[];
      initialCategories?: { name: string; type: AccountType; icon: IconName }[];
      currencyCode: string;
    },
  ) => Promise<boolean>;
  updateWorkplaceIcon: (workplace: PlainWorkplace, icon: IconName) => Promise<void>;
  startCreateWorkplace: () => void;
  cancelCreateWorkplace: () => void;
}

export function useWorkplaceSettingsViewModel(): WorkplaceSettingsViewModel {
  const { workplaceId: activeWorkplaceId, setWorkplaceId: setActiveWorkplaceId } = useWorkplace();
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingWorkplace, setIsCreatingWorkplace] = useState(false);

  const { data: workplaces = [] } = useObservable(
    () => workplaceService.observeAllWorkplaces(),
    [],
    [],
  );

  const { data: activeWorkplace } = useWorkplaceSnapshot(activeWorkplaceId);

  const setActiveWorkplace = useCallback(
    (workplace: PlainWorkplace) => {
      setActiveWorkplaceId(workplace.id);
      analytics.trackFeatureUsage('settings', 'switch_workplace');
      toast.info(`Switched to ${workplace.name}`);
    },
    [setActiveWorkplaceId],
  );

  const startCreateWorkplace = useCallback(() => {
    setIsCreating(true);
  }, []);

  const cancelCreateWorkplace = useCallback(() => {
    setIsCreating(false);
  }, []);

  const createWorkplace = useCallback(
    async (
      name: string,
      icon: IconName,
      options: {
        initialAccounts?: { name: string; type: AccountType; icon: IconName }[];
        initialCategories?: { name: string; type: AccountType; icon: IconName }[];
        currencyCode: string;
      },
    ) => {
      if (!name.trim()) {
        return false;
      }
      setIsCreatingWorkplace(true);
      try {
        const newWorkplace = await workplaceService.createWorkplace(name.trim(), icon, options);
        analytics.trackFeatureUsage('settings', 'create_workplace', {
          currency: options.currencyCode,
          initial_accounts_count: options.initialAccounts?.length ?? 0,
        });
        setActiveWorkplace(newWorkplace);
        cancelCreateWorkplace();
        return true;
      } catch {
        toast.error('Failed to create workplace.');
        return false;
      } finally {
        setIsCreatingWorkplace(false);
      }
    },
    [cancelCreateWorkplace, setActiveWorkplace],
  );

  const updateWorkplaceIcon = useCallback(async (workplace: PlainWorkplace, icon: IconName) => {
    try {
      await workplaceService.updateWorkplace(workplace.id, { icon });
      analytics.trackFeatureUsage('settings', 'update_workplace_icon', { icon });
    } catch {
      toast.error('Failed to update workplace icon.');
    }
  }, []);

  return {
    workplaces: [...workplaces].sort((a, b) => a.name.localeCompare(b.name)),
    activeWorkplace: activeWorkplace ?? undefined,
    isCreating,
    isCreatingWorkplace,
    setActiveWorkplace,
    createWorkplace,
    updateWorkplaceIcon,
    startCreateWorkplace,
    cancelCreateWorkplace,
  };
}
