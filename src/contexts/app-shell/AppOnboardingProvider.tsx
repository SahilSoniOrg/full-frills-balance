import { requireShellContext } from '@/src/contexts/app-shell/requireShellContext';
import { preferences } from '@/src/services/preferences';
import React, { createContext, useContext, useMemo, useSyncExternalStore } from 'react';

export interface AppOnboardingValue {
  hasCompletedOnboarding: boolean;
}

export const AppOnboardingContext = createContext<AppOnboardingValue | undefined>(undefined);

export function useOnboardingSession(): AppOnboardingValue {
  return requireShellContext(useContext(AppOnboardingContext), 'useOnboardingSession');
}

export function AppOnboardingProvider({ children }: { children: React.ReactNode }) {
  const hasCompletedOnboarding = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.device.observe('deviceRegistered').subscribe(() => onStoreChange());
      return () => sub.unsubscribe();
    },
    () => preferences.device.deviceRegistered,
    () => preferences.device.deviceRegistered,
  );

  const value = useMemo<AppOnboardingValue>(
    () => ({ hasCompletedOnboarding }),
    [hasCompletedOnboarding],
  );

  return <AppOnboardingContext.Provider value={value}>{children}</AppOnboardingContext.Provider>;
}
