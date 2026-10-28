import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppConfig } from '@/src/constants/app-config';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { fetchMissingHistoricalRates } from '@/src/services/reports-v2/missingExchangeRateFetch';
import { confirm, toast } from '@/src/utils/alerts';
import { useReportsV2ViewModel } from '../useReportsV2ViewModel';
import type { ReportsV2QueryEngine } from '@/src/services/reports-v2/reportQueryEngine';

jest.mock('@/src/utils/alerts', () => ({
  confirm: { show: jest.fn(options => options.onConfirm()) },
  toast: { info: jest.fn(), warning: jest.fn(), success: jest.fn(), error: jest.fn() },
}));
jest.mock('@/src/services/reports-v2/missingExchangeRateFetch', () => ({
  fetchMissingHistoricalRates: jest.fn(async () => ({ attempted: 1, fetched: 1, failed: 0 })),
}));
jest.mock('@/src/data/repositories/journal/journalQueryRepository', () => ({
  journalQueryRepository: { findRecentActive: jest.fn(async () => []) },
}));

const journals = journalQueryRepository as jest.Mocked<typeof journalQueryRepository>;

function engineMock(): jest.Mocked<ReportsV2QueryEngine> {
  return {
    run: jest.fn(async query => ({
      kind: 'OVERVIEW' as const,
      query,
      period: query.period,
      generatedAt: Date.now(),
      measures: {},
      sections: [],
      warnings: [],
    })),
    drillDown: jest.fn(
      async (_query: Parameters<ReportsV2QueryEngine['drillDown']>[0]) => [] as readonly string[],
    ),
  };
}

describe('useReportsV2ViewModel load lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    journals.findRecentActive.mockResolvedValue([]);
  });

  it('keeps the previous section visible while a section refresh fails', async () => {
    const engine = engineMock();
    engine.run
      .mockResolvedValueOnce({
        kind: 'OVERVIEW',
        query: {} as never,
        period: {} as never,
        generatedAt: Date.now(),
        measures: {},
        sections: [
          { id: 'overview', title: 'Overview' },
          { id: 'health', title: 'Health' },
        ],
        warnings: [],
      })
      .mockRejectedValueOnce(new Error('section unavailable'));

    const { result } = renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'USD',
      }),
    );

    await waitFor(() => expect(engine.run).toHaveBeenCalledTimes(1));
    expect(result.current.renderedSection?.id).toBe('overview');

    act(() => result.current.setActiveSection('income'));

    expect(result.current.renderedSection?.id).toBe('overview');
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.renderedSection?.id).toBe('overview');
  });

  it('loads once for a stable initial query instead of reloading on every render', async () => {
    const engine = engineMock();
    renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'USD',
      }),
    );

    await waitFor(() => expect(engine.run).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(engine.run).toHaveBeenCalledTimes(1);
  });

  it('requests only the active section so health reads stay explicit', async () => {
    const engine = engineMock();
    const { result } = renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'USD',
      }),
    );

    await waitFor(() => expect(engine.run).toHaveBeenCalledTimes(1));
    expect(engine.run.mock.calls[0][0].sections).toEqual(['overview']);

    act(() => result.current.setActiveSection('health'));

    await waitFor(() => expect(engine.run).toHaveBeenCalledTimes(2));
    expect(engine.run.mock.calls[1][0].sections).toEqual(['health']);
  });

  it('reloads with the selected account scope', async () => {
    const engine = engineMock();
    const { result } = renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'USD',
      }),
    );

    await waitFor(() => expect(engine.run).toHaveBeenCalledTimes(1));
    act(() => result.current.filters.onAccountIdsChange(['account-1']));

    await waitFor(() => expect(engine.run).toHaveBeenCalledTimes(2));
    expect(engine.run.mock.calls[1][0].accountIds).toEqual(['account-1']);
  });

  it('shifts the initial period onto the latest journal when the book is historical', async () => {
    const latestJournalDate = new Date();
    latestJournalDate.setDate(latestJournalDate.getDate() - 90);
    latestJournalDate.setHours(14, 30, 0, 0);
    journals.findRecentActive.mockResolvedValueOnce([
      { journalDate: latestJournalDate.getTime() } as never,
    ] as never);

    const engine = engineMock();
    const { result } = renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'USD',
      }),
    );

    await waitFor(() => expect(result.current.filters.periodPreset).toBe('custom'));

    const expectedStart = new Date(latestJournalDate);
    expectedStart.setDate(expectedStart.getDate() - AppConfig.defaults.reportDays);
    expectedStart.setHours(0, 0, 0, 0);
    const expectedEnd = new Date(latestJournalDate);
    expectedEnd.setHours(23, 59, 59, 999);

    await waitFor(() =>
      expect(engine.run.mock.calls.at(-1)?.[0].period).toEqual({
        startDate: expectedStart.getTime(),
        endDate: expectedEnd.getTime(),
        timeZone: expect.any(String),
      }),
    );
  });

  it('does not overwrite a custom range selected before the latest journal lookup resolves', async () => {
    let resolveLookup!: (journals: never[]) => void;
    journals.findRecentActive.mockReturnValueOnce(
      new Promise(resolve => {
        resolveLookup = resolve as (journals: never[]) => void;
      }) as never,
    );

    const engine = engineMock();
    const { result } = renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'USD',
      }),
    );

    await waitFor(() => expect(engine.run).toHaveBeenCalled());
    act(() => result.current.setCustomRange(123, 456));

    await act(async () => {
      resolveLookup([{ journalDate: Date.now() - 90 * 24 * 60 * 60 * 1000 }] as never[]);
    });

    expect(result.current.filters.periodPreset).toBe('custom');
    await waitFor(() =>
      expect(engine.run.mock.calls.at(-1)?.[0].period).toEqual(
        expect.objectContaining({ startDate: 123, endDate: 456 }),
      ),
    );
  });

  it('includes archived accounts by default and supports an active-only scope', async () => {
    const engine = engineMock();
    const { result } = renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'USD',
      }),
    );

    await waitFor(() => expect(engine.run).toHaveBeenCalledTimes(1));
    expect(engine.run.mock.calls[0][0].includeArchivedAccounts).toBe(true);

    act(() => result.current.filters.onIncludeArchivedAccountsChange(false));

    await waitFor(() => expect(engine.run).toHaveBeenCalledTimes(2));
    expect(engine.run.mock.calls[1][0].includeArchivedAccounts).toBe(false);
  });

  it('coalesces rapid filter changes while keeping the current report visible', async () => {
    const engine = engineMock();
    const { result } = renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'USD',
      }),
    );

    await waitFor(() => expect(engine.run).toHaveBeenCalledTimes(1));

    act(() => result.current.filters.onComparisonChange('NONE'));
    expect(result.current.state).toBe('refreshing');
    act(() => result.current.filters.onBasisChange('ACTUAL_PLUS_PLANNED'));

    await waitFor(() => expect(engine.run).toHaveBeenCalledTimes(2));
    expect(engine.run.mock.calls[1][0].comparison).toBe('NONE');
    expect(engine.run.mock.calls[1][0].basis).toBe('ACTUAL_PLUS_PLANNED');
  });

  it('opens the custom range picker from the period control', () => {
    const engine = engineMock();
    const onRequestCustomRange = jest.fn();
    const { result } = renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'USD',
        onRequestCustomRange,
      }),
    );

    act(() => result.current.filters.onPeriodPresetChange('custom'));

    expect(onRequestCustomRange).toHaveBeenCalledTimes(1);
    expect(result.current.filters.periodPreset).toBe('month');
  });

  it('disables comparison when the period becomes all time', () => {
    const engine = engineMock();
    const { result } = renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'USD',
      }),
    );

    act(() => result.current.filters.onPeriodPresetChange('all-time'));

    expect(result.current.filters.comparison).toBe('NONE');
  });

  it('returns drill-down context so the screen can open matching journals', async () => {
    const engine = engineMock();
    engine.drillDown.mockResolvedValue(['journal-1']);
    const onJournalDrilldown = jest.fn();
    const { result } = renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'USD',
        onJournalDrilldown,
      }),
    );

    act(() => result.current.onDrilldown({ label: 'Food' }));

    await waitFor(() =>
      expect(onJournalDrilldown).toHaveBeenCalledWith({
        label: 'Food',
        journalIds: ['journal-1'],
        startDate: expect.any(Number),
        endDate: expect.any(Number),
      }),
    );
  });

  it('opens scoped category drill-downs without waiting for a ledger rebuild', () => {
    const engine = engineMock();
    const onJournalDrilldown = jest.fn();
    const { result } = renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'USD',
        onJournalDrilldown,
      }),
    );

    act(() => result.current.onDrilldown({ label: 'Food', accountIds: ['food'] }));

    expect(engine.drillDown).not.toHaveBeenCalled();
    expect(onJournalDrilldown).toHaveBeenCalledWith({
      label: 'Food',
      journalIds: [],
      accountIds: ['food'],
      startDate: expect.any(Number),
      endDate: expect.any(Number),
    });
  });

  it('fetches missing-rate quotes from the warning then refreshes', async () => {
    const quotes = [{ fromCurrency: 'USD', toCurrency: 'INR', rateDate: Date.UTC(2026, 8, 1) }];
    const engine = engineMock();
    engine.run.mockResolvedValue({
      kind: 'OVERVIEW',
      query: {} as never,
      period: {} as never,
      generatedAt: Date.now(),
      measures: {},
      sections: [{ id: 'health', title: 'Health' }],
      warnings: [
        {
          code: 'MISSING_EXCHANGE_RATE',
          severity: 'WARNING',
          message: 'omitted',
          count: 1,
          missingRateQuotes: quotes,
        },
      ],
    });

    const { result } = renderHook(() =>
      useReportsV2ViewModel({
        engine,
        workplaceId: 'workplace-1',
        targetCurrency: 'INR',
        initialSection: 'health',
      }),
    );

    await waitFor(() => expect(result.current.canFetchMissingRates).toBe(true));
    await act(async () => {
      result.current.onFetchMissingRates();
    });

    expect(confirm.show).toHaveBeenCalled();
    expect(fetchMissingHistoricalRates).toHaveBeenCalledWith(quotes);
    expect(toast.success).toHaveBeenCalled();
    await waitFor(() => expect(engine.run.mock.calls.length).toBeGreaterThan(1));
  });
});
