import { mockAccountFormVmState, mockOnSave } from './useAccountFormViewModel.test.state';

jest.mock('react-native/Libraries/Animated/NativeAnimatedModule', () => {
  const { NativeModules } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: {
      ...NativeModules.NativeAnimatedModule,
      connectAnimatedNodeToShadowNodeFamily: jest.fn(),
    },
  };
});

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: ({ visible, children }: import('react-native').ModalProps) =>
      visible ? React.createElement(React.Fragment, null, children) : null,
  };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockAccountFormVmState.mockParams,
  usePathname: () => mockAccountFormVmState.mockPathname,
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'workplace', defaultCurrencyCode: 'USD' }),
}));
jest.mock('@/src/hooks/useAccounts', () => ({
  useAccount: () => ({ account: mockAccountFormVmState.mockExistingAccount, isLoading: false }),
  useAccountBalance: () => ({ balanceData: null, isLoading: false }),
  useAccountBalances: () => ({
    balancesByAccountId: new Map(
      mockAccountFormVmState.mockAccounts.map(account => [
        account.id,
        { directTransactionCount: 0 },
      ]),
    ),
  }),
  useAccounts: () => ({ accounts: mockAccountFormVmState.mockAccounts }),
}));
jest.mock('@/src/hooks/use-currencies', () => ({
  useCurrencies: () => ({
    currencies: [
      { id: 'usd', code: 'USD', symbol: '$', name: 'US Dollar', precision: 2 },
      { id: 'eur', code: 'EUR', symbol: '€', name: 'Euro', precision: 2 },
    ],
  }),
}));
jest.mock('@/src/hooks/useObservable', () => ({
  useObservable: (_factory: unknown, _deps: unknown, initial: unknown) => ({
    data: typeof initial === 'boolean' ? mockAccountFormVmState.mockIsParent : initial,
    isLoading: false,
  }),
}));
jest.mock('@/src/services/accounts/accountQueries', () => ({ accountQueries: {} }));
jest.mock('@/src/features/accounts/hooks/useAccountActions', () => ({
  useAccountActions: () => ({}),
}));
jest.mock('@/src/features/accounts/hooks/useAccountPersistence', () => ({
  useAccountPersistence: () => ({
    isCreating: false,
    handleCancel: jest.fn(),
    handleSave: jest.fn(),
  }),
}));
jest.mock('@/src/features/accounts/hooks/useAccountValidation', () => ({
  useAccountValidation: () => ({ formError: null }),
}));
jest.mock('@/src/features/accounts/hooks/useAccountArchiveAction', () => ({
  useAccountArchiveAction: () => ({ headerActionItems: [], archiveCascadeModal: null }),
}));
jest.mock('@/src/features/accounts/hooks/useAccountDeleteMergeActions', () => ({
  useAccountDeleteMergeActions: () => ({ headerActionItems: [], mergePickerModal: null }),
}));
jest.mock('@/src/features/accounts/hooks/form/useAccountFormBalanceClassify', () => ({
  useAccountFormBalanceClassify: () => ({ balanceClassify: null, onSave: mockOnSave }),
}));
jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));
