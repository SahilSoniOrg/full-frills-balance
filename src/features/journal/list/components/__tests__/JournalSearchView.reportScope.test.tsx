import { JournalSearchView } from '../JournalSearchView';
import type { JournalSearchViewModel } from '@/src/features/journal/list/hooks/useJournalSearchViewModel';
import type { ScreenNavChrome } from '@/src/components/layout';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/features/journal/components/JournalListView', () => ({
  JournalListView: ({ list }: { list: { listHeader?: React.ReactNode } }) =>
    list.listHeader ?? null,
}));
jest.mock('@/src/components/account-selection', () => ({ MultiAccountPickerModal: () => null }));
jest.mock('@/src/components/filters/DateRangePicker', () => ({ DateRangePicker: () => null }));

describe('JournalSearchView report drill-down scope', () => {
  it('shows a clear action for the active report scope', () => {
    const clearReportScope = jest.fn();
    const vm = {
      searchQuery: '',
      setSearchQuery: jest.fn(),
      dateRange: null,
      periodFilter: { type: 'ALL_TIME' },
      setDateRange: jest.fn(),
      accountIds: [],
      setAccountIds: jest.fn(),
      minAmount: '',
      setMinAmount: jest.fn(),
      maxAmount: '',
      setMaxAmount: jest.fn(),
      displayType: '',
      setDisplayType: jest.fn(),
      reportScopeLabel: 'Category: Food',
      clearReportScope,
      clearFilters: jest.fn(),
      items: [],
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      accounts: [],
      isAccountPickerVisible: false,
      openAccountPicker: jest.fn(),
      closeAccountPicker: jest.fn(),
      isDatePickerVisible: false,
      openDatePicker: jest.fn(),
      closeDatePicker: jest.fn(),
      selectedIds: new Set(),
      isSelectionModeActive: false,
      onLongPressItem: jest.fn(),
      toggleSelection: jest.fn(),
      selectAll: jest.fn(),
      clearItems: jest.fn(),
      exitSelectionMode: jest.fn(),
      onShareSelected: jest.fn(),
      setSelectedIds: jest.fn(),
      actions: [],
    } as unknown as JournalSearchViewModel;

    render(<JournalSearchView chrome={{} as ScreenNavChrome} {...vm} />);

    expect(screen.getByText('Report drill-down · Category: Food')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Clear report drill-down scope' }));

    expect(clearReportScope).toHaveBeenCalledTimes(1);
  });
});
