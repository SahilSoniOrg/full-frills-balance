import { render, RenderOptions } from '@testing-library/react-native';
import React, { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/src/constants/theme';
import { UIContext } from '@/src/contexts/UIContext';
import { Theme } from '@react-navigation/native';

// Mock Theme
const mockTheme: Theme = {
    dark: false,
    colors: {
        primary: Colors.light.tint,
        background: Colors.light.background,
        card: Colors.light.background, // fallback
        text: Colors.light.text,
        border: '#ccc',
        notification: 'red',
    },
    fonts: { // Mock fonts as the default navigation theme structure
        regular: { fontFamily: 'System', fontWeight: '400' },
        medium: { fontFamily: 'System', fontWeight: '500' },
        bold: { fontFamily: 'System', fontWeight: '700' },
        heavy: { fontFamily: 'System', fontWeight: '900' },
    }
};

const mockUIContext: any = {
    themePreference: 'system' as const,
    themeMode: 'light' as const,
    hasCompletedOnboarding: true,
    isLoading: false,
    isInitialized: true,
    userName: 'Test User',
    defaultCurrency: 'USD',
    isPrivacyMode: false,
    isRestartRequired: false,
    restartType: null,
    importStats: null,
    completeOnboarding: async () => Promise.resolve(),
    setThemePreference: async () => Promise.resolve(),
    setLoading: () => { },
    resetApp: async () => Promise.resolve(),
    cleanupDatabase: async () => Promise.resolve({ deletedCount: 0 }),
    updateUserDetails: async () => Promise.resolve(),
    setPrivacyMode: async () => Promise.resolve(),
    requireRestart: () => { },
};

// Custom Render with Providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
    return (
        <SafeAreaProvider initialMetrics={{
            frame: { x: 0, y: 0, width: 320, height: 640 },
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}>
            <UIContext.Provider value={mockUIContext}>
                {children}
            </UIContext.Provider>
        </SafeAreaProvider>
    );
};

const customRender = (
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react-native';
export { customRender as render };

