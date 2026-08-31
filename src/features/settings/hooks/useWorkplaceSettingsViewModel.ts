import { IconName } from '@/src/components/core';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { PlainWorkplace } from '@/src/types/plainDtos';
import { useObservable } from '@/src/hooks/useObservable';
import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { analytics } from '@/src/services/analytics';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AppConfig } from '@/src/constants/app-config';
import { confirm, toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useState } from 'react';

export interface WorkplaceSettingsViewModel {
  workplaces: PlainWorkplace[];
  activeWorkplace: PlainWorkplace | undefined;
  setActiveWorkplace: (workplace: PlainWorkplace) => Promise<void>;
  updateWorkplaceIcon: (workplace: PlainWorkplace, icon: IconName) => Promise<void>;
  deleteWorkplace: (workplace: PlainWorkplace) => void;
  deletingWorkplaceId: string | null;
  startCreateWorkplace: () => void;
}

export function useWorkplaceSettingsViewModel(): WorkplaceSettingsViewModel {
  const {
    workplaceId: activeWorkplaceId,
    setWorkplaceId: setActiveWorkplaceId,
    deleteWorkplace: deleteActiveWorkplace,
  } = useWorkplace();
  const { data: workplaces = [] } = useObservable(
    () => workplaceService.observeAllWorkplaces(),
    [],
    [],
  );

  const { data: activeWorkplace } = useWorkplaceSnapshot(activeWorkplaceId);
  const [deletingWorkplaceId, setDeletingWorkplaceId] = useState<string | null>(null);

  const setActiveWorkplace = useCallback(
    async (workplace: PlainWorkplace) => {
      try {
        await setActiveWorkplaceId(workplace.id);
      } catch {
        toast.error('Failed to switch workplace.');
        return;
      }
      analytics.trackFeatureUsage('settings', 'switch_workplace');
      toast.info(`Switched to ${workplace.name}`);
    },
    [setActiveWorkplaceId],
  );

  const startCreateWorkplace = useCallback(() => {
    AppNavigation.toWorkplaceCreation();
  }, []);

  const updateWorkplaceIcon = useCallback(async (workplace: PlainWorkplace, icon: IconName) => {
    try {
      await workplaceService.updateWorkplace(workplace.id, { icon });
      analytics.trackFeatureUsage('settings', 'update_workplace_icon', { icon });
    } catch {
      toast.error('Failed to update workplace icon.');
    }
  }, []);

  const deleteWorkplace = useCallback(
    (workplace: PlainWorkplace) => {
      const isLast = workplaces.length === 1;
      confirm.show({
        title: AppConfig.strings.settings.workplaceManagement.deleteTitle,
        message: AppConfig.strings.settings.workplaceManagement.deleteMessage(
          workplace.name,
          isLast,
        ),
        confirmText: AppConfig.strings.settings.workplaceManagement.deleteConfirm,
        destructive: true,
        requiredConfirmationValue: workplace.name,
        onConfirm: async () => {
          setDeletingWorkplaceId(workplace.id);
          try {
            const result = await deleteActiveWorkplace(workplace.id);
            if (result.status === 'committed_with_warnings') {
              toast.warning('Workplace deleted, but some cleanup will be retried.');
            }
          } catch {
            toast.error('Failed to delete workplace. Your books were not changed.');
          } finally {
            setDeletingWorkplaceId(null);
          }
        },
      });
    },
    [deleteActiveWorkplace, workplaces.length],
  );

  return {
    workplaces: [...workplaces].sort((a, b) => a.name.localeCompare(b.name)),
    activeWorkplace: activeWorkplace ?? undefined,
    setActiveWorkplace,
    updateWorkplaceIcon,
    deleteWorkplace,
    deletingWorkplaceId,
    startCreateWorkplace,
  };
}
