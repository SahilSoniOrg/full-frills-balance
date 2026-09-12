import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useReportsV2ViewModel } from '../useReportsV2ViewModel';
import type { ReportsV2QueryEngine } from '@/src/services/reports-v2/reportQueryEngine';

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
});
