import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppShellTestProvider, type AppShellValue } from '@/src/contexts/UIContext';
import { budgetFormStrings as copy } from '@/src/constants/copy/domains/budgetFormStrings';
import { useBudgetEditViewModel } from '@/src/features/budget/hooks/useBudgetEditViewModel';
import BudgetEditScreen from '../BudgetEditScreen';
import { minimalBudgetEditViewModel } from './budgetEditScreen.fixtures';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
jest.mock('@/src/features/accounts', () => ({
  CurrencyPickerSheet: () => null,
  CurrencySideControl: () => null,
  resolveCurrencySymbol: (code: string) => code,
}));
jest.mock('@/src/components/forms/EntityFormScreen', () => ({
  EntityFormScreen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/src/components/forms/schedule/ScheduleField', () => ({
  ScheduleField: () => null,
}));
jest.mock('@/src/hooks/useConfirmUnsavedChanges', () => ({
  useConfirmUnsavedChanges: () => ({ onBack: jest.fn() }),
}));
jest.mock('@/src/features/budget/hooks/useBudgetEditViewModel', () => ({
  useBudgetEditViewModel: jest.fn(),
}));
jest.mock('@/src/components/account-selection', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable } = require('react-native') as typeof import('react-native');
  return {
    MultiAccountPickerModal: ({
      visible,
      title,
      onClose,
    }: {
      visible: boolean;
      title: string;
      onClose: () => void;
    }) =>
      visible
        ? createElement(
            Pressable,
            { testID: 'budget-asset-picker', accessibilityLabel: title, onPress: onClose },
            title,
          )
        : null,
  };
});

const shellValue: AppShellValue = {
  hasCompletedOnboarding: true,
  isLoading: false,
  isInitialized: true,
  fontsReady: true,
  loadedFontId: null,
  isRestartRequired: false,
  isResetInProgress: false,
  restartType: null,
  importStats: null,
  isDataHydrated: true,
  isUnlocked: true,
  hasUnlockedThisSession: true,
  isAppActive: true,
  isLockAuthenticating: false,
  isAppCurrentlyLocked: false,
  isAppReady: true,
  setFontsReady: () => {},
  setDataHydrated: () => {},
  authenticateSession: () => {},
  setIsAppActive: () => {},
  setIsLockAuthenticating: () => {},
  requireRestart: () => {},
  beginReset: () => {},
  cancelReset: () => {},
};

function ProvidersWithoutPrivacyScope({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AppShellTestProvider value={shellValue}>{children}</AppShellTestProvider>
    </SafeAreaProvider>
  );
}

describe('BudgetEditScreen privacy scope', () => {
  it('renders the new-budget route with the real privacy-aware money hook', () => {
    jest.mocked(useBudgetEditViewModel).mockReturnValue(minimalBudgetEditViewModel());

    const screen = render(<BudgetEditScreen />, { wrapper: ProvidersWithoutPrivacyScope });

    expect(screen.getByTestId('hero-name-input')).toBeTruthy();
  });
});

describe('BudgetEditScreen field chrome', () => {
  it('uses SectionLabel headings and opens set-aside from a ListGroup FormRow', () => {
    jest.mocked(useBudgetEditViewModel).mockReturnValue(minimalBudgetEditViewModel());

    const screen = render(<BudgetEditScreen />, { wrapper: ProvidersWithoutPrivacyScope });

    expect(screen.getByRole('header', { name: copy.whatCounts.toUpperCase() })).toBeTruthy();
    expect(screen.getByRole('header', { name: copy.settings.toUpperCase() })).toBeTruthy();
    expect(screen.queryByTestId('budget-asset-picker')).toBeNull();

    fireEvent.press(screen.getByTestId('budget-set-aside-from'));

    expect(screen.getByTestId('budget-asset-picker')).toBeTruthy();
  });
});
