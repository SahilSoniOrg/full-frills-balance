import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppShellTestProvider, type AppShellValue } from '@/src/contexts/UIContext';
import { useBudgetEditViewModel } from '@/src/features/budget/hooks/useBudgetEditViewModel';
import type { BudgetEditViewModel } from '@/src/features/budget/hooks/useBudgetEditViewModel';
import BudgetEditScreen from '../BudgetEditScreen';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
jest.mock('@/src/features/accounts', () => ({ CurrencySelector: () => null }));
jest.mock('@/src/components/forms/EntityFormScreen', () => ({
  EntityFormScreen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/src/hooks/useConfirmUnsavedChanges', () => ({
  useConfirmUnsavedChanges: () => ({ onBack: jest.fn() }),
}));
jest.mock('@/src/features/budget/hooks/useBudgetEditViewModel', () => ({
  useBudgetEditViewModel: jest.fn(),
}));

const shellValue: AppShellValue = {
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
  setFontsReady: () => {},
  setDataHydrated: () => {},
  authenticateSession: () => {},
  setIsAppActive: () => {},
  setIsLockAuthenticating: () => {},
  requireRestart: () => {},
};

const viewModel = {
  expenseAccounts: [],
  liquidAssetAccounts: [],
  budget: null,
  name: '',
  setName: jest.fn(),
  amount: '',
  setAmount: jest.fn(),
  startMonth: new Date(2026, 9, 1),
  intervalType: 'MONTHLY',
  intervalN: 1,
  schedule: { intervalType: 'MONTHLY', intervalN: 1 },
  scheduleStartDate: new Date(2026, 9, 1).getTime(),
  setSchedule: jest.fn(),
  selectedAccountIds: [],
  setSelectedAccountIds: jest.fn(),
  selectedCategories: [],
  categorySuggestions: [],
  addCategory: jest.fn(),
  removeCategory: jest.fn(),
  assetAccountIds: [],
  setAssetAccountIds: jest.fn(),
  fundingLabel: 'Automatic',
  spendingHistory: [],
  averageSpend: null,
  useAverage: jest.fn(),
  amountLabel: 'Limit each month',
  currencies: [],
  currencyCode: 'USD',
  setCurrencyCode: jest.fn(),
  save: jest.fn(),
  loading: false,
  isSaving: false,
  isFormValid: false,
  requirementHint: 'Add a name, an amount, and one category.',
  onCancel: jest.fn(),
} as unknown as BudgetEditViewModel;

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
    jest.mocked(useBudgetEditViewModel).mockReturnValue(viewModel);

    const screen = render(<BudgetEditScreen />, { wrapper: ProvidersWithoutPrivacyScope });

    expect(screen.getByTestId('hero-name-input')).toBeTruthy();
  });
});
