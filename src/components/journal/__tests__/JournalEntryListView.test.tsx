import { fireEvent, render } from '@/src/testing/render';
import { JournalEntryListView } from '../JournalEntryListView';
import { AppConfig } from '@/src/constants';

jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));

describe('JournalEntryListView failures', () => {
  it('shows retry instead of an empty result until the read recovers', () => {
    const retry = jest.fn();
    const view = render(
      <JournalEntryListView
        items={[]}
        error={new Error('Read failed')}
        retry={retry}
        emptyTitle="No matching entries"
      />,
    );

    expect(view.getByText(AppConfig.strings.common.listLoadError)).toBeTruthy();
    expect(view.queryByText('No matching entries')).toBeNull();
    fireEvent.press(view.getByText(AppConfig.strings.common.retry));
    expect(retry).toHaveBeenCalledTimes(1);

    view.rerender(
      <JournalEntryListView
        items={[]}
        error={null}
        retry={retry}
        emptyTitle="No matching entries"
      />,
    );
    expect(view.getByText('No matching entries')).toBeTruthy();
    expect(view.queryByText(AppConfig.strings.common.listLoadError)).toBeNull();
  });

  it('forwards selectedIds and isSelectionModeActive via extraData so rows update when items keep identity', () => {
    type AccountId = import('@/src/types/ids').AccountId;
    type JournalId = import('@/src/types/ids').JournalId;
    type IconName = import('@/src/types/domainIcons').IconName;
    const j1 = 'j1' as JournalId;
    const j2 = 'j2' as JournalId;
    const txDate = Date.UTC(2026, 9, 10);
    const makeEntry = (
      id: JournalId,
      title: string,
      amount: number,
    ): import('@/src/types/ui').JournalListItem => ({
      id,
      type: 'journal',
      date: txDate,
      selectionId: id,
      onPress: jest.fn(),
      cardProps: {
        title,
        amount,
        currencyCode: 'USD',
        transactionDate: txDate,
        presentation: {
          label: 'Expense',
          showTypeBadge: false,
          typeIcon: 'arrowDown' as IconName,
          typeColor: 'expense',
          amountColorKey: 'expense',
          amountPrefix: '− ',
        },
        accountFlow: {
          primaryAccount: {
            id: 'Cash',
            accountId: 'cash' as AccountId,
            name: 'Cash',
            role: 'SOURCE',
            fallbackIcon: 'wallet' as IconName,
            variant: 'default',
          },
          sources: [],
          destinations: [
            {
              id: 'Food',
              accountId: 'food' as AccountId,
              name: 'Food',
              role: 'DESTINATION',
              fallbackIcon: 'wallet' as IconName,
              variant: 'default',
            },
          ],
          neutral: [],
          showCurrencyCodes: false,
        },
      },
    });
    const items = [makeEntry(j1, 'Lunch', 25), makeEntry(j2, 'Coffee', 5)];

    const view = render(
      <JournalEntryListView items={items} isSelectionModeActive selectedIds={new Set([j1])} />,
    );
    expect(view.getAllByRole('button', { selected: true })).toHaveLength(1);
    expect(
      view.getAllByTestId('journal-entry-card-selection-outline', { includeHiddenElements: true }),
    ).toHaveLength(1);

    view.rerender(
      <JournalEntryListView items={items} isSelectionModeActive selectedIds={new Set([j1, j2])} />,
    );
    expect(view.getAllByRole('button', { selected: true })).toHaveLength(2);
    expect(
      view.getAllByTestId('journal-entry-card-selection-outline', { includeHiddenElements: true }),
    ).toHaveLength(2);
  });
});
