import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { useObservable } from '@/src/hooks/useObservable';
import { workplaceService } from '@/src/services/WorkplaceService';
import { evictWorkplaceReactiveCaches } from '@/src/services/reactive/evictWorkplaceReactiveCaches';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { analytics } from '@/src/services/analytics-service';
import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { WorkplaceId } from '@/src/types/domain';

export interface WorkplaceContextType {
  readonly workplaceId: WorkplaceId;
  readonly defaultCurrencyCode: string;
  setWorkplaceId: (id: string) => void;
}

export const WorkplaceContext = createContext<WorkplaceContextType | undefined>(undefined);

function isWorkplaceNotFoundError(error: Error | null): boolean {
  return !!error && error.message.includes('Workplace not found');
}

/** Extract id from `Workplace not found: <id>`; null when the message has no id. */
function workplaceIdFromNotFoundError(error: Error | null): string | null {
  if (!error) return null;
  const match = error.message.match(/Workplace not found:\s*(.+)$/);
  return match?.[1]?.trim() || null;
}

export function WorkplaceProvider({ children }: { children: React.ReactNode }) {
  const prevWorkplaceIdRef = useRef<WorkplaceId | null>(null);

  const { data: activeWorkplaceId } = useObservable(
    () => preferences.observe('activeWorkplaceId'),
    [],
    () => preferences.activeWorkplaceId,
  );

  useEffect(() => {
    if (activeWorkplaceId) return;
    logger.warn('[WorkplaceProvider] No activeWorkplaceId. Waiting...');
    workplaceService.ensureDefaultWorkplace().catch(err => {
      logger.error('[WorkplaceProvider] Failed to bootstrap workplace', err);
    });
  }, [activeWorkplaceId]);

  const { data: workplace, error } = useWorkplaceSnapshot(activeWorkplaceId);

  useEffect(() => {
    if (!isWorkplaceNotFoundError(error) || !activeWorkplaceId) return;
    // Ignore stale errors from a different workplace id (e.g. prefs briefly restored
    // an imported backup's activeWorkplaceId that does not exist in this DB).
    const missingId = workplaceIdFromNotFoundError(error);
    if (missingId && missingId !== activeWorkplaceId) return;

    // RECOVERY: Missing workplace → reset so the user can re-onboard.
    logger.error(
      `[WorkplaceProvider] Workplace ${activeWorkplaceId} not found in database. Resetting app state.`,
    );
    preferences.setActiveWorkplaceId(undefined);
    preferences.setOnboardingCompleted(false);
  }, [error, activeWorkplaceId]);

  useEffect(() => {
    if (!activeWorkplaceId) return;
    const prev = prevWorkplaceIdRef.current;
    if (prev !== null && prev !== activeWorkplaceId) {
      evictWorkplaceReactiveCaches({ from: prev, to: activeWorkplaceId });
    }
    prevWorkplaceIdRef.current = activeWorkplaceId;
  }, [activeWorkplaceId]);

  const setWorkplaceId = useCallback((id: string) => {
    if (!id) {
      throw new Error('Invalid workplaceId');
    }
    const oldId = preferences.activeWorkplaceId;
    preferences.setActiveWorkplaceId(id as WorkplaceId);
    if (oldId && oldId !== id) {
      analytics.logWorkplaceSwitched(oldId, id);
    }
  }, []);

  if (error && !isWorkplaceNotFoundError(error)) {
    throw error;
  }

  if (!workplace) {
    return null;
  }

  const value: WorkplaceContextType = {
    workplaceId: workplace.id,
    defaultCurrencyCode: workplace.defaultCurrencyCode,
    setWorkplaceId,
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
