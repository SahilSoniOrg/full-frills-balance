import { act, renderHook } from '@testing-library/react-native';
import { useJournalSearchFilters } from '../useJournalSearchFilters';

jest.mock('@/src/services/analytics', () => ({
  analytics: { trackFeatureUsage: jest.fn() },
}));

describe('useJournalSearchFilters report drill-down scope', () => {
  const reportScopeParams = {
    startDate: '10',
    endDate: '20',
    accountIds: 'category-account',
    journalIds: 'journal-1,journal-2',
    reportScopeLabel: 'Category: Food',
    reportScopeStartDate: '1',
    reportScopeEndDate: '100',
    reportScopeAccountIds: 'base-account',
  };

  it('shows the active scope and restores the report filters when it is cleared', () => {
    const { result } = renderHook(() => useJournalSearchFilters(reportScopeParams));

    expect(result.current.reportScopeLabel).toBe('Category: Food');
    expect(result.current.queryOptions).toEqual(
      expect.objectContaining({
        accountIds: ['category-account'],
        journalIds: ['journal-1', 'journal-2'],
      }),
    );

    act(() => result.current.clearReportScope());

    expect(result.current.reportScopeLabel).toBeUndefined();
    expect(result.current.queryDateRange).toEqual({ startDate: 1, endDate: 100 });
    expect(result.current.accountIds).toEqual(['base-account']);
    expect(result.current.queryOptions.journalIds).toBeUndefined();
  });

  it('removes hidden journal scopes when all filters are cleared', () => {
    const { result } = renderHook(() => useJournalSearchFilters(reportScopeParams));

    act(() => result.current.clearFilters());

    expect(result.current.reportScopeLabel).toBeUndefined();
    expect(result.current.queryDateRange).toBeUndefined();
    expect(result.current.accountIds).toEqual([]);
    expect(result.current.queryOptions.journalIds).toBeUndefined();
  });
});
