import { workplaceService } from '@/src/services/WorkplaceService';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface WorkspaceContextType {
  readonly workplaceId: string;
  setWorkplaceId: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workplaceId, setWorkplaceIdState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeWorkspace = async () => {
      try {
        const activeWorkplace = await workplaceService.ensureDefaultWorkplace();
        if (isMounted) {
          setWorkplaceIdState(activeWorkplace.id);
          setIsLoaded(true);
        }
      } catch (err) {
        logger.error('[WorkspaceProvider] Error initializing workspace context', err);

        if (isMounted) {
          setError(err as Error);
          setIsLoaded(true);
        }
      }
    };

    initializeWorkspace();

    const subscription = preferences.observe('activeWorkplaceId').subscribe(id => {
      if (!isMounted) return;

      if (!id) {
        setError(new Error('activeWorkplaceId became empty'));
        return;
      }

      setWorkplaceIdState(id);
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

    preferences.setActiveWorkplaceId(id);
  }, []);

  if (!isLoaded) {
    return null;
  }

  if (!workplaceId) {
    throw new Error('Workspace failed to initialize');
  }

  const value = {
    workplaceId,
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

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextType {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
