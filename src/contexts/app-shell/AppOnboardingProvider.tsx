import { requireShellContext } from '@/src/contexts/app-shell/requireShellContext';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { onboardingService } from '@/src/features/onboarding/services/OnboardingService';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';

export interface AppOnboardingValue {
  hasCompletedOnboarding: boolean;
  persistDisplayName: (name: string) => void;
  completeDeviceOnboarding: (name: string) => Promise<void>;
}

export const AppOnboardingContext = createContext<AppOnboardingValue | undefined>(undefined);

export function useOnboardingSession(): AppOnboardingValue {
  return requireShellContext(useContext(AppOnboardingContext), 'useOnboardingSession');
}

export function AppOnboardingProvider({ children }: { children: React.ReactNode }) {
  const hasCompletedOnboarding = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.device
        .observe('onboardingCompleted')
        .subscribe(() => onStoreChange());
      return () => sub.unsubscribe();
    },
    () => preferences.device.onboardingCompleted,
    () => preferences.device.onboardingCompleted,
  );

  const completeDeviceOnboarding = useCallback(async (name: string) => {
    try {
      onboardingService.claimDevice(name);
    } catch (error) {
      logger.warn('[UIContext] Failed to complete onboarding', { error });
      throw error;
    }
  }, []);

  const persistDisplayName = useCallback((name: string) => {
    onboardingService.persistDisplayName(name);
  }, []);

  const value = useMemo<AppOnboardingValue>(
    () => ({
      hasCompletedOnboarding,
      persistDisplayName,
      completeDeviceOnboarding,
    }),
    [hasCompletedOnboarding, persistDisplayName, completeDeviceOnboarding],
  );

  return <AppOnboardingContext.Provider value={value}>{children}</AppOnboardingContext.Provider>;
}
