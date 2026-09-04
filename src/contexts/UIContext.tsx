/**
 * App shell composition: boot, lock, restart, and onboarding providers.
 * Import machine hooks from their owner files, not from here.
 */

import { AppLockContext, AppLockProvider } from '@/src/contexts/app-shell/AppLockProvider';
import type { AppLockValue } from '@/src/contexts/app-shell/AppLockProvider';
import {
  AppOnboardingContext,
  AppOnboardingProvider,
} from '@/src/contexts/app-shell/AppOnboardingProvider';
import type { AppOnboardingValue } from '@/src/contexts/app-shell/AppOnboardingProvider';
import { AppReadyContext, AppReadyProvider } from '@/src/contexts/app-shell/AppReadyProvider';
import type { AppReadyValue } from '@/src/contexts/app-shell/AppReadyProvider';
import { AppRestartContext, AppRestartProvider } from '@/src/contexts/app-shell/AppRestartProvider';
import type { AppRestartValue } from '@/src/contexts/app-shell/AppRestartProvider';
import { FontId, ThemeId, ThemeMode } from '@/src/constants/design-tokens';
import React, { createContext, useContext, useMemo } from 'react';

export type AppShellValue = AppReadyValue & AppLockValue & AppRestartValue & AppOnboardingValue;

export type ThemeOverrideValue = {
  mode?: ThemeMode;
  themeId?: ThemeId;
  fontId?: FontId;
};

const ThemeOverrideContext = createContext<ThemeOverrideValue | null>(null);

export function ThemeOverride({
  mode,
  themeId,
  fontId,
  children,
}: ThemeOverrideValue & { children: React.ReactNode }) {
  const value = useMemo<ThemeOverrideValue>(
    () => ({ mode, themeId, fontId }),
    [mode, themeId, fontId],
  );
  return <ThemeOverrideContext.Provider value={value}>{children}</ThemeOverrideContext.Provider>;
}

export function useThemeOverride() {
  return useContext(ThemeOverrideContext);
}

/** Test helper: feed one mock object into the four shell contexts. */
export function AppShellTestProvider({
  value,
  children,
}: {
  value: AppShellValue;
  children: React.ReactNode;
}) {
  return (
    <AppReadyContext.Provider value={value}>
      <AppLockContext.Provider value={value}>
        <AppRestartContext.Provider value={value}>
          <AppOnboardingContext.Provider value={value}>{children}</AppOnboardingContext.Provider>
        </AppRestartContext.Provider>
      </AppLockContext.Provider>
    </AppReadyContext.Provider>
  );
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  return (
    <AppReadyProvider>
      <AppLockProvider>
        <AppRestartProvider>
          <AppOnboardingProvider>{children}</AppOnboardingProvider>
        </AppRestartProvider>
      </AppLockProvider>
    </AppReadyProvider>
  );
}
