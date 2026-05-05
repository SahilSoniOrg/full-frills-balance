import { workplaceService } from '@/src/services/WorkplaceService';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { WorkplaceId } from '@/src/types/domain';

export interface WorkplaceContextType {
  readonly workplaceId: WorkplaceId;
  readonly defaultCurrencyCode: string;
  setWorkplaceId: (id: string) => void;
}

const WorkplaceContext = createContext<WorkplaceContextType | null>(null);

export function WorkplaceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    workplaceId: WorkplaceId;
    defaultCurrencyCode: string;
  } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    let workplaceSubscription: any = null;

    const setupWorkplaceSubscription = async (id: string) => {
      if (workplaceSubscription) workplaceSubscription.unsubscribe();

      try {
        const workplace = await workplaceService.getWorkplace(id);
        if (!workplace) {
          throw new Error(`Workplace ${id} not found`);
        }

        if (isMounted) {
          // Set initial state from the workplace model
          setState({
            workplaceId: workplace.id as WorkplaceId,
            defaultCurrencyCode: workplace.defaultCurrencyCode,
          });
          setIsLoaded(true);
        }

        workplaceSubscription = workplace.observe().subscribe(w => {
          if (isMounted && w) {
            setState({
              workplaceId: w.id as WorkplaceId,
              defaultCurrencyCode: w.defaultCurrencyCode,
            });
          }
        });
      } catch (err) {
        logger.error('[WorkplaceProvider] Error setting up workplace subscription', err);
        if (isMounted) {
          setError(err as Error);
          setIsLoaded(true);
        }
      }
    };

    const initialize = async () => {
      try {
        const activeWorkplace = await workplaceService.ensureDefaultWorkplace();
        if (isMounted) {
          await setupWorkplaceSubscription(activeWorkplace.id);
        }
      } catch (err) {
        logger.error('[WorkplaceProvider] Critical initialization failure', err);
        if (isMounted) {
          setError(err as Error);
          setIsLoaded(true);
        }
      }
    };

    initialize();

    const prefsSubscription = preferences.observe('activeWorkplaceId').subscribe(async id => {
      if (!isMounted) return;

      if (!id) {
        logger.warn('[WorkplaceProvider] activeWorkplaceId became empty, attempting recovery...');
        try {
          const recovered = await workplaceService.ensureDefaultWorkplace();
          if (isMounted) await setupWorkplaceSubscription(recovered.id);
        } catch (err) {
          logger.error('[WorkplaceProvider] Critical recovery failure', err);
          if (isMounted) setError(new Error('Workplace context lost and recovery failed'));
        }
        return;
      }

      await setupWorkplaceSubscription(id);
    });

    return () => {
      isMounted = false;
      prefsSubscription.unsubscribe();
      if (workplaceSubscription) workplaceSubscription.unsubscribe();
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
