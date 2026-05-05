import { AppConfig } from '@/src/constants';
import { workplaceService } from '@/src/services/WorkplaceService';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface WorkplaceContextType {
  readonly workplaceId: string;
  readonly defaultCurrencyCode: string;
  setWorkplaceId: (id: string) => void;
}

const WorkplaceContext = createContext<WorkplaceContextType | null>(null);

export function WorkplaceProvider({ children }: { children: React.ReactNode }) {
  const [workplaceId, setWorkplaceIdState] = useState<string | null>(null);
  const [defaultCurrencyCode, setDefaultCurrencyCode] = useState<string>(AppConfig.defaultCurrency);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    let workplaceSubscription: any = null;

    const initializeWorkplace = async () => {
      try {
        const activeWorkplace = await workplaceService.ensureDefaultWorkplace();
        if (isMounted) {
          setWorkplaceIdState(activeWorkplace.id);
          setIsLoaded(true);
        }
      } catch (err) {
        logger.error('[WorkplaceProvider] Error initializing Workplace context', err);
        if (isMounted) {
          setError(err as Error);
          setIsLoaded(true);
        }
      }
    };

    initializeWorkplace();

    const prefsSubscription = preferences.observe('activeWorkplaceId').subscribe(async id => {
      if (!isMounted) return;

      if (!id) {
        logger.warn('[WorkplaceProvider] activeWorkplaceId became empty, attempting recovery...');
        try {
          const recovered = await workplaceService.ensureDefaultWorkplace();
          if (isMounted) setWorkplaceIdState(recovered.id);
        } catch (err) {
          logger.error('[WorkplaceProvider] Critical recovery failure', err);
          if (isMounted) setError(new Error('Workplace context lost and recovery failed'));
        }
        return;
      }

      setWorkplaceIdState(id);

      // Observe the workplace model for currency changes
      if (workplaceSubscription) workplaceSubscription.unsubscribe();
      const workplace = await workplaceService.getWorkplace(id);
      if (workplace) {
        workplaceSubscription = workplace.observe().subscribe(w => {
          if (isMounted && w.defaultCurrencyCode) {
            setDefaultCurrencyCode(w.defaultCurrencyCode);
          }
        });
      }
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

    preferences.setActiveWorkplaceId(id);
  }, []);

  if (!isLoaded) {
    return null;
  }

  if (!workplaceId) {
    throw new Error('Workplace failed to initialize');
  }

  const value = {
    workplaceId,
    defaultCurrencyCode,
    setWorkplaceId,
  };
  // Surface errors properly (not inside useEffect)
  if (error) {
    throw error;
  }

  // Hard gate
  if (!isLoaded || !workplaceId) {
    return null;
  }

  return <WorkplaceContext.Provider value={value}>{children}</WorkplaceContext.Provider>;
}

export function useWorkplace(): WorkplaceContextType {
  const context = useContext(WorkplaceContext);
  if (!context) {
    throw new Error('useWorkplace must be used within a WorkplaceProvider');
  }
  return context;
}
