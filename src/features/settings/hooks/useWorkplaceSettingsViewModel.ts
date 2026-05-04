import { useWorkspace } from '@/src/contexts/WorkspaceContext';
import Workplace from '@/src/data/models/Workplace';
import { useCallback, useState } from 'react';
import { useObservable } from '@/src/hooks/useObservable';
import { of as observableOf } from 'rxjs';
import { toast } from '@/src/utils/alerts';
import { IconName } from '@/src/components/core';
import { workplaceService } from '@/src/services/WorkplaceService';

export interface WorkplaceSettingsViewModel {
  workplaces: Workplace[];
  activeWorkplace: Workplace | undefined;
  isCreating: boolean;
  isCreatingWorkplace: boolean;
  setActiveWorkplace: (workplace: Workplace) => void;
  createWorkplace: (name: string, icon: IconName) => Promise<boolean>;
  updateWorkplaceIcon: (workplace: Workplace, icon: IconName) => Promise<void>;
  startCreateWorkplace: () => void;
  cancelCreateWorkplace: () => void;
}

export function useWorkplaceSettingsViewModel(): WorkplaceSettingsViewModel {
  const { workplaceId: activeWorkplaceId, setWorkplaceId: setActiveWorkplaceId } = useWorkspace();
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingWorkplace, setIsCreatingWorkplace] = useState(false);

  const { data: workplaces = [] } = useObservable(
    () => workplaceService.observeAllWorkplaces(),
    [],
    [],
  );

  const { data: activeWorkplace } = useObservable(
    () =>
      activeWorkplaceId
        ? workplaceService.observeWorkplace(activeWorkplaceId)
        : observableOf(undefined),
    [activeWorkplaceId],
    undefined,
  );

  const setActiveWorkplace = useCallback(
    (workplace: Workplace) => {
      setActiveWorkplaceId(workplace.id);
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
    async (name: string, icon: IconName) => {
      if (!name.trim()) {
        return false;
      }
      setIsCreatingWorkplace(true);
      try {
        const newWorkplace = await workplaceService.createWorkplace(name.trim(), icon);
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

  const updateWorkplaceIcon = useCallback(async (workplace: Workplace, icon: IconName) => {
    try {
      await workplaceService.updateWorkplace(workplace.id, { icon });
    } catch {
      toast.error('Failed to update workplace icon.');
    }
  }, []);

  return {
    workplaces: [...workplaces].sort((a, b) => a.name.localeCompare(b.name)),
    activeWorkplace,
    isCreating,
    isCreatingWorkplace,
    setActiveWorkplace,
    createWorkplace,
    updateWorkplaceIcon,
    startCreateWorkplace,
    cancelCreateWorkplace,
  };
}
