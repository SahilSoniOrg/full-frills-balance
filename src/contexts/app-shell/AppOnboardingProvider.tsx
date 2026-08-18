import { requireShellContext } from '@/src/contexts/app-shell/requireShellContext';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';

export interface AppOnboardingValue {
  hasCompletedOnboarding: boolean;
  completeOnboarding: (name: string, archetype?: string) => Promise<void>;
}

export const AppOnboardingContext = createContext<AppOnboardingValue | undefined>(undefined);

export function useOnboardingSession(): AppOnboardingValue {
  return requireShellContext(useContext(AppOnboardingContext), 'useOnboardingSession');
}

export function AppOnboardingProvider({ children }: { children: React.ReactNode }) {
  const hasCompletedOnboarding = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('onboardingCompleted').subscribe(() => onStoreChange());
      return () => sub.unsubscribe();
    },
    () => preferences.onboardingCompleted,
    () => preferences.onboardingCompleted,
  );

  const completeOnboarding = useCallback(async (name: string, archetypeValue?: string) => {
    try {
      await preferences.setUserName(name);
      if (archetypeValue) await preferences.setArchetype(archetypeValue);
      await preferences.setOnboardingCompleted(true);
    } catch (error) {
      logger.warn('[UIContext] Failed to complete onboarding', { error });
      try {
        preferences.setOnboardingCompleted(true);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const value = useMemo<AppOnboardingValue>(
    () => ({
      hasCompletedOnboarding,
      completeOnboarding,
    }),
    [hasCompletedOnboarding, completeOnboarding],
  );

  return <AppOnboardingContext.Provider value={value}>{children}</AppOnboardingContext.Provider>;
}
