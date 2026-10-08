import { act, renderHook } from '@testing-library/react-native';
import { BehaviorSubject, NEVER, of as mockOf } from 'rxjs';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import { useAccountDetailsData } from '@/src/features/accounts/hooks/details/useAccountDetailsData';
import { reactiveDataService } from '@/src/services/ReactiveDataService';

const mockArchivedAt$ = new BehaviorSubject<number | null>(null);

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({
    workplaceId: 'wp-detail' as WorkplaceId,
    defaultCurrencyCode: 'USD',
  }),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ accountId: 'account-1' as AccountId }),
}));

jest.mock('@/src/services/ReactiveDataService', () => ({
  reactiveDataService: {
    observeAccountDashboard: jest.fn(() =>
      mockOf({
        account: {
          id: 'account-1',
          name: 'Checking',
          accountType: 'ASSET',
          currencyCode: 'USD',
          deletedAt: undefined,
        },
        balance: null,
        subAccounts: [],
        allAccounts: [],
      }),
    ),
  },
}));

jest.mock('@/src/services/accounts/accountQueries', () => ({
  accountQueries: {
    observeArchivedAt: jest.fn(() => mockArchivedAt$),
    observeReconciledAt: jest.fn(() => mockOf(null)),
  },
}));

jest.mock('@/src/services/accounts/accountDerivedReads', () => ({
  observeUnreconciledMetrics: jest.fn(() => mockOf({ count: 0, total: 0 })),
}));

jest.mock('@/src/hooks/useDateRangeFilter', () => ({
  useDateRangeFilter: () => ({
    dateRange: null,
    periodFilter: { type: 'ALL' },
    isPickerVisible: false,
    showPicker: jest.fn(),
    hidePicker: jest.fn(),
    setFilter: jest.fn(),
    navigatePrevious: jest.fn(),
    navigateNext: jest.fn(),
  }),
}));

describe('useAccountDetailsData archive state', () => {
  beforeEach(() => {
    mockArchivedAt$.next(null);
  });

  it('keeps empty hierarchy inputs stable during hydration to avoid restarting dependent queries', () => {
    jest.mocked(reactiveDataService.observeAccountDashboard).mockReturnValueOnce(NEVER);
    const { result, rerender } = renderHook(() => useAccountDetailsData());
    const accounts = result.current.accounts;
    const balances = result.current.rawSubBalances;
    expect(result.current.dashboardLoading).toBe(true);
    rerender(undefined);
    expect(result.current.accounts).toBe(accounts);
    expect(result.current.rawSubBalances).toBe(balances);
  });

  it('updates isArchived when the account is archived and unarchived', () => {
    const { result } = renderHook(() => useAccountDetailsData());

    expect(result.current.isArchived).toBe(false);

    act(() => mockArchivedAt$.next(Date.parse('2026-01-01T00:00:00.000Z')));
    expect(result.current.isArchived).toBe(true);

    act(() => mockArchivedAt$.next(null));
    expect(result.current.isArchived).toBe(false);
  });
});
