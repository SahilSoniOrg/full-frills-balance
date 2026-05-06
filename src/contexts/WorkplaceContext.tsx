import { workplaceService } from '@/src/services/WorkplaceService';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { WorkplaceId } from '@/src/types/domain';
import { from, map, of, switchMap } from 'rxjs';

export interface WorkplaceContextType {
  readonly workplaceId: WorkplaceId;
  readonly defaultCurrencyCode: string;
  setWorkplaceId: (id: string) => void;
}

export const WorkplaceContext = createContext<WorkplaceContextType | undefined>(undefined);

export function WorkplaceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    workplaceId: WorkplaceId;
    defaultCurrencyCode: string;
  } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const subscription = preferences
      .observe('activeWorkplaceId')
      .pipe(
        // 1. Ensure we have an ID. If not, this is a valid terminal state for this provider
        // until preferences are updated (e.g. by onboarding or import).
        switchMap(id => {
          if (!id) {
            logger.warn('[WorkplaceProvider] No activeWorkplaceId. Waiting...');
            return of(null);
          }
          return of(id);
        }),
        // 2. Load the workplace from database.
        switchMap(id => {
          if (!id) return of(null);
          return from(workplaceService.getWorkplace(id)).pipe(
            map(workplace => {
              if (!workplace) {
                // RUTHLESS: No silent resurrection. Surface the void.
                throw new Error(`Workplace ${id} not found in database.`);
              }
              return workplace;
            }),
          );
        }),
        // 3. Observe for live updates.
        switchMap(workplace => {
          if (!workplace) return of(null);
          return workplace.observe();
        }),
      )
      .subscribe({
        next: workplace => {
          if (isMounted && workplace) {
            setState({
              workplaceId: workplace.id as WorkplaceId,
              defaultCurrencyCode: workplace.defaultCurrencyCode,
            });
            setIsLoaded(true);
          }
        },
        error: err => {
          logger.error('[WorkplaceProvider] Pipeline failure', err);
          if (isMounted) {
            setError(err as Error);
            setIsLoaded(true);
          }
        },
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const setWorkplaceId = useCallback((id: string) => {
    if (!id) {
      throw new Error('Invalid workplaceId');
    }
    const oldId = preferences.activeWorkplaceId;
    preferences.setActiveWorkplaceId(id as WorkplaceId);
    if (oldId && oldId !== id) {
      const { analytics } = require('@/src/services/analytics-service');
      analytics.logWorkplaceSwitched(oldId, id);
    }
  }, []);

  if (error) {
    throw error;
  }

  if (!isLoaded || !state) {
    return null;
  }

  const value: WorkplaceContextType = {
    workplaceId: state.workplaceId,
    defaultCurrencyCode: state.defaultCurrencyCode,
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
