import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { WorkplaceId } from '@/src/types/ids';
import { snapshotService } from '@/src/utils/SnapshotService';
import type { PlainWorkplace } from '@/src/types/plainDtos';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface WorkplaceContextType {
  /** Committed books currently rendered (held across an in-flight switch gap). */
  readonly workplaceId: WorkplaceId;
  readonly activeWorkplace: PlainWorkplace;
  readonly defaultCurrencyCode: string;
  /** True while the coordinator transition runs or books still show the prior workplace. */
  readonly isSwitchingWorkplace: boolean;
  readonly workplaceSwitchError: string | null;
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

function isReadyWorkplace(
  workplace: PlainWorkplace | null | undefined,
  workplaceId: WorkplaceId,
): workplace is PlainWorkplace {
  return !!workplace && workplace.id === workplaceId && !!workplace.defaultCurrencyCode;
}

export function WorkplaceProvider({
  targetWorkplaceId,
  initialWorkplace,
  onSwitchWorkplace,
  onDeleteWorkplace,
  onCommittedWorkplace,
  isSwitchingWorkplace = false,
  workplaceSwitchError = null,
  children,
}: {
  /** Launch-coordinator target; may differ from committed books during a switch gap. */
  targetWorkplaceId: WorkplaceId;
  /** Already observed by launch discovery; lets the books tree mount immediately. */
  initialWorkplace?: PlainWorkplace;
  /** Coordinator-owned transition handler. */
  onSwitchWorkplace: (id: WorkplaceId) => Promise<void>;
  /** Coordinator-owned deletion handler. */
  onDeleteWorkplace: (id: WorkplaceId) => Promise<{
    status: 'committed' | 'committed_with_warnings';
    warnings: string[];
  }>;
  /** Fires when committed books match `targetWorkplaceId` (including after a gap). */
  onCommittedWorkplace?: (id: WorkplaceId) => void;
  isSwitchingWorkplace?: boolean;
  workplaceSwitchError?: string | null;
  children: React.ReactNode;
}) {
  const { data: workplace, error, isLoading } = useWorkplaceSnapshot(targetWorkplaceId);
  const [lastCommitted, setLastCommitted] = useState<PlainWorkplace | null>(null);

  const matched = !error && isReadyWorkplace(workplace, targetWorkplaceId) ? workplace : null;
  if (matched && matched !== lastCommitted) {
    setLastCommitted(matched);
  }

  // useObservable keeps the previous row while the new id subscribes. Treating that
  // mismatch as "unload" unmounts the nav tree and remounts on the dashboard.
  // Hold the last committed books across the gap (coordinator overlay covers it).
  const inSwitchGap = !!lastCommitted && lastCommitted.id !== targetWorkplaceId;
  const canUseLaunchSeed = isLoading && isReadyWorkplace(initialWorkplace, targetWorkplaceId);
  const activeWorkplace =
    matched ?? (inSwitchGap ? lastCommitted : canUseLaunchSeed ? initialWorkplace : null);

  useEffect(() => {
    if (!matched) return;
    onCommittedWorkplace?.(matched.id);
  }, [matched, onCommittedWorkplace]);

  useEffect(() => {
    if (!matched) return;
    snapshotService.deferCustomSnapshot(matched.id, 'workplace', {
      defaultCurrencyCode: matched.defaultCurrencyCode,
    });
  }, [matched]);

  const setWorkplaceId = useCallback(
    async (id: WorkplaceId) => onSwitchWorkplace(id),
    [onSwitchWorkplace],
  );
  const deleteWorkplace = useCallback(
    (id: WorkplaceId) => onDeleteWorkplace(id),
    [onDeleteWorkplace],
  );

  if (error && !isWorkplaceNotFoundError(error) && !inSwitchGap) {
    throw error;
  }

  // A missing/deleted row is a coordinator recovery state: never render books
  // against a dead target — except across an in-flight switch gap, where the
  // previous books stay mounted under the overlay.
  if (!activeWorkplace) {
    return null;
  }

  const defaultCurrencyCode = activeWorkplace.defaultCurrencyCode;
  if (!defaultCurrencyCode) {
    return null;
  }

  const value: WorkplaceContextType = {
    workplaceId: activeWorkplace.id,
    activeWorkplace,
    defaultCurrencyCode,
    isSwitchingWorkplace: isSwitchingWorkplace || inSwitchGap,
    workplaceSwitchError,
    setWorkplaceId,
    deleteWorkplace,
  };

  return <WorkplaceContext.Provider value={value}>{children}</WorkplaceContext.Provider>;
}

export function useWorkplace(): WorkplaceContextType {
  const context = useContext(WorkplaceContext);
  if (context === undefined) {
    throw new Error('useWorkplace must be used within a WorkplaceProvider');
  }
  return context;
}

/** Optional variant for shared chrome that also renders during setup gates. */
export function useOptionalWorkplace(): WorkplaceContextType | undefined {
  return useContext(WorkplaceContext);
}
