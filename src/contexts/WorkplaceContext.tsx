import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { WorkplaceId } from '@/src/types/ids';
import { snapshotService } from '@/src/utils/SnapshotService';
import React, { createContext, useCallback, useContext, useEffect } from 'react';

export interface WorkplaceContextType {
  readonly workplaceId: WorkplaceId;
  readonly defaultCurrencyCode: string;
  setWorkplaceId: (id: WorkplaceId) => Promise<void>;
  deleteWorkplace: (id: WorkplaceId) => Promise<{
    status: 'committed' | 'committed_with_warnings';
    warnings: string[];
  }>;
}

export const WorkplaceContext = createContext<WorkplaceContextType | undefined>(undefined);

function isWorkplaceNotFoundError(error: Error | null): boolean {
  return !!error && error.message.includes('Workplace not found');
}

export function WorkplaceProvider({
  workplaceId,
  onSwitchWorkplace,
  onDeleteWorkplace,
  children,
}: {
  /** The launch coordinator must validate this ID before mounting books. */
  workplaceId: WorkplaceId;
  /** Coordinator-owned transition handler. */
  onSwitchWorkplace: (id: WorkplaceId) => Promise<void>;
  /** Coordinator-owned deletion handler. */
  onDeleteWorkplace: (id: WorkplaceId) => Promise<{
    status: 'committed' | 'committed_with_warnings';
    warnings: string[];
  }>;
  children: React.ReactNode;
}) {
  const { data: workplace, error } = useWorkplaceSnapshot(workplaceId);

  useEffect(() => {
    if (!workplace) return;
    snapshotService.deferCustomSnapshot(workplace.id, 'workplace', {
      defaultCurrencyCode: workplace.defaultCurrencyCode,
    });
  }, [workplace]);

  const setWorkplaceId = useCallback(
    async (id: WorkplaceId) => onSwitchWorkplace(id),
    [onSwitchWorkplace],
  );
  const deleteWorkplace = useCallback(
    (id: WorkplaceId) => onDeleteWorkplace(id),
    [onDeleteWorkplace],
  );

  if (error && !isWorkplaceNotFoundError(error)) {
    throw error;
  }

  // A missing row is a coordinator recovery state. Never let books render against
  // a stale preference or cached snapshot while that recovery is in progress.
  if (error || !workplace || workplace.id !== workplaceId) {
    return null;
  }

  const defaultCurrencyCode = workplace.defaultCurrencyCode;
  if (!defaultCurrencyCode) {
    return null;
  }

  const value: WorkplaceContextType = {
    workplaceId,
    defaultCurrencyCode,
    setWorkplaceId,
    deleteWorkplace,
  };

  return <WorkplaceContext.Provider value={value}>{children}</WorkplaceContext.Provider>;
}

export function useWorkplace(): WorkplaceContextType {
  const context = useContext(WorkplaceContext);
  if (!context) {
    throw new Error('useWorkplace must be used within a WorkplaceProvider');
  }
  return context;
}

/** Optional variant for shared chrome that also renders during setup gates. */
export function useOptionalWorkplace(): WorkplaceContextType | undefined {
  return useContext(WorkplaceContext);
}
