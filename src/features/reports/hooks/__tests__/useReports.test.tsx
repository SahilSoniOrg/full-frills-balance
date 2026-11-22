import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppConfig } from '@/src/constants/app-config';
import { reportService } from '@/src/services/report-service';
import { useReports } from '../useReports';

jest.mock('@/src/services/report-service', () => ({
  reportService: {
    findLatestActiveJournalDate: jest.fn(),
    getReportSnapshot: jest.fn(),
    getIncomeVsExpense: jest.fn(),
  },
}));
jest.mock('@/src/hooks/useObservable', () => ({
  useObservableWithEnrichment: (
    _observe: unknown,
    _enrich: unknown,
    _deps: unknown,
    fallback: unknown,
  ) => ({
    data: fallback,
    isLoading: false,
    error: null,
  }),
}));
jest.mock('@/src/hooks/use-theme', () => ({ useTheme: () => ({ theme: {} }) }));
jest.mock('@/src/services/reactive/reactiveWorkplaceObserves', () => {
  const { of } = jest.requireActual('rxjs');
  return {
    observeWorkplaceActiveTransactionCount: jest.fn(() => of(0)),
    observeWorkplaceAccounts: jest.fn(() => of([])),
    observeWorkplaceJournalMeta: jest.fn(() => of([])),
  };
});
jest.mock('@/src/services/accounts/accountQueries', () => {
  const { of } = jest.requireActual('rxjs');
  return {
    accountQueries: {
      observeAll: jest.fn(() => of([])),
      findAll: jest.fn(async () => []),
    },
  };
});

const reports = reportService as jest.Mocked<typeof reportService>;

describe('useReports initial date range', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shifts the initial range to the latest journal when the book is historical', async () => {
    const latestJournalDate = new Date();
    latestJournalDate.setDate(latestJournalDate.getDate() - 90);
    latestJournalDate.setHours(14, 30, 0, 0);
    reports.findLatestActiveJournalDate.mockResolvedValue(latestJournalDate.getTime());

    const { result } = renderHook(() => useReports('workplace-1' as never, 'USD'));

    await waitFor(() => expect(result.current.periodFilter.type).toBe('CUSTOM'));

    const expectedStart = new Date(latestJournalDate);
    expectedStart.setDate(expectedStart.getDate() - AppConfig.defaults.reportDays);
    expectedStart.setHours(0, 0, 0, 0);
    const expectedEnd = new Date(latestJournalDate);
    expectedEnd.setHours(23, 59, 59, 999);

    expect(result.current.dateRange).toEqual({
      startDate: expectedStart.getTime(),
      endDate: expectedEnd.getTime(),
    });
  });

  it('does not overwrite a range explicitly selected before the latest journal lookup resolves', async () => {
    let resolveLookup!: (date: number | null) => void;
    reports.findLatestActiveJournalDate.mockReturnValue(
      new Promise(resolve => {
        resolveLookup = resolve;
      }),
    );

    const { result } = renderHook(() => useReports('workplace-1' as never, 'USD'));
    const selectedRange = { startDate: 123, endDate: 456 };
    const selectedFilter = { type: 'CUSTOM' as const, ...selectedRange };

    act(() =>
      result.current.updateFilter(selectedRange, selectedFilter, undefined, {
        explicitPeriodSelection: true,
      }),
    );
    await act(async () => {
      resolveLookup(Date.now() - 90 * 24 * 60 * 60 * 1000);
    });

    expect(result.current.dateRange).toEqual(selectedRange);
    expect(result.current.periodFilter).toEqual(selectedFilter);
  });
});
