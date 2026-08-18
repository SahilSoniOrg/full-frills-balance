import { render, RenderOptions } from '@testing-library/react-native';
import React, { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShellTestProvider, type AppShellValue } from '@/src/contexts/UIContext';
import { PrivacyScopeProvider } from '@/src/contexts/PrivacyScope';

const mockUIContext: AppShellValue = {
  hasCompletedOnboarding: true,
  isLoading: false,
  isInitialized: true,
  fontsReady: true,
  loadedFontId: null,
  isRestartRequired: false,
  restartType: null,
  importStats: null,
  isDataHydrated: true,
  isUnlocked: true,
  hasUnlockedThisSession: true,
  isAppActive: true,
  isLockAuthenticating: false,
  isAppCurrentlyLocked: false,
  isAppReady: true,
  completeOnboarding: async () => Promise.resolve(),
  setFontsReady: () => {},
  setDataHydrated: () => {},
  authenticateSession: () => {},
  setIsAppActive: () => {},
  setIsLockAuthenticating: () => {},
  requireRestart: () => {},
};

// Custom Render with Providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <PrivacyScopeProvider>
        <AppShellTestProvider value={mockUIContext}>{children}</AppShellTestProvider>
      </PrivacyScopeProvider>
    </SafeAreaProvider>
  );
};

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react-native';
export { customRender as render };
