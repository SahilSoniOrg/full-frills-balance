import { AppConfig } from '@/src/constants';
import { render, RenderOptions } from '@testing-library/react-native';
import React, { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UIContext } from '@/src/contexts/UIContext';

// Mock Theme
// Mock Theme
// const mockTheme: Theme = { ... };

const mockUIContext: any = {
  themePreference: 'system' as const,
  themeMode: 'light' as const,
  hasCompletedOnboarding: true,
  isLoading: false,
  isInitialized: true,
  userName: 'Test User',
  defaultCurrency: AppConfig.defaultCurrency,
  isPrivacyMode: false,
  isRestartRequired: false,
  restartType: null,
  importStats: null,
  completeOnboarding: async () => Promise.resolve(),
  setThemePreference: async () => Promise.resolve(),
  updateUserDetails: async () => Promise.resolve(),
  setPrivacyMode: async () => Promise.resolve(),
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
      <UIContext.Provider value={mockUIContext}>{children}</UIContext.Provider>
    </SafeAreaProvider>
  );
};

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react-native';
export { customRender as render };
