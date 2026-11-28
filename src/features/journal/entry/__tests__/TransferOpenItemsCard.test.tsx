import { fireEvent, render } from '@/src/testing/render';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { peopleReadService } from '@/src/services/people';
import {
  asAccountId,
  asJournalId,
  asOpenItemId,
  asPersonId,
  asWorkplaceId,
  type OpenItemId,
} from '@/src/types/ids';
import { of } from 'rxjs';
import { TransferOpenItemsCard } from '../components/TransferOpenItemsCard';
import {
  buildTransferOpenItemAllocations,
  buildTransferOpenItemQuickFillChips,
  useTransferOpenItems,
} from '../hooks/useTransferOpenItems';

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => true,
}));

describe('TransferOpenItemsCard', () => {
  it('forwards quick fill and mode changes', () => {
    const quick = jest.fn(),
      mode = jest.fn();
    const { getByTestId, getByText } = render(
      <TransferOpenItemsCard
        items={[]}
        totalOpenRemainder={10}
        currencyCode="USD"
        quickFillChips={[{ id: 'full', label: 'Full balance', amount: 10 }]}
        allocationMode="fifo"
        onAllocationModeChange={mode}
        selectedItemIds={{}}
        onToggleItem={jest.fn()}
        onQuickFillAmount={quick}
      />,
    );
    fireEvent(getByTestId('transfer-allocation-mode'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 40 } },
    });
    fireEvent.press(getByText(/Full balance/));
    fireEvent.press(getByText('Pick items'));
    expect(quick).toHaveBeenCalledWith('10');
    expect(mode).toHaveBeenCalledWith('pick');
  });
  it('selects an open item row', () => {
    const toggle = jest.fn();
    const { getByText } = render(
      <TransferOpenItemsCard
        items={[
          { item: { id: 'a' as OpenItemId, originalAmount: 8, currencyCode: 'USD' }, remainder: 3 },
        ]}
        totalOpenRemainder={3}
        currencyCode="USD"
        quickFillChips={[]}
        allocationMode="pick"
        onAllocationModeChange={jest.fn()}
        selectedItemIds={{}}
        onToggleItem={toggle}
        onQuickFillAmount={jest.fn()}
      />,
    );
    fireEvent.press(getByText(/\$3\.00 remaining/));
    expect(toggle).toHaveBeenCalledWith('a');
  });
  it('uses the shared remainder/original labels and selects an item from its quick fill', () => {
    const quick = jest.fn();
    const only = jest.fn();
    const { getByText } = render(
      <TransferOpenItemsCard
        items={[
          { item: { id: 'a' as OpenItemId, originalAmount: 8, currencyCode: 'USD' }, remainder: 3 },
        ]}
        totalOpenRemainder={3}
        currencyCode="USD"
        quickFillChips={[{ id: 'a', label: 'Item 1', amount: 3 }]}
        allocationMode="fifo"
        onAllocationModeChange={jest.fn()}
        selectedItemIds={{}}
        onToggleItem={jest.fn()}
        onQuickFillAmount={quick}
        onSelectOnlyItem={only}
      />,
    );
    expect(getByText('$3.00 remaining')).toBeTruthy();
    expect(getByText('of $8.00 total')).toBeTruthy();
    fireEvent.press(getByText(/Item 1/));
    expect(quick).toHaveBeenCalledWith('3');
    expect(only).toHaveBeenCalledWith('a');
  });
  it('builds capped allocations in input order and generates full/half/item chips', () => {
    const items = [
      { item: { id: 'a' as OpenItemId, originalAmount: 5, currencyCode: 'USD' }, remainder: 2 },
      { item: { id: 'b' as OpenItemId, originalAmount: 6, currencyCode: 'USD' }, remainder: 4 },
    ];
    expect(buildTransferOpenItemAllocations(items, { a: true, b: true }, 5, 'pick')).toEqual([
      { openItemId: 'a', amount: 2 },
      { openItemId: 'b', amount: 3 },
    ]);
    expect(buildTransferOpenItemAllocations(items, {}, 5, 'fifo')).toEqual([
      { openItemId: 'a', amount: 2 },
      { openItemId: 'b', amount: 3 },
    ]);
    expect(buildTransferOpenItemQuickFillChips(items, 2).map(chip => chip.amount)).toEqual([
      6, 3, 2, 4,
    ]);
    expect(buildTransferOpenItemQuickFillChips([items[0]], 2).map(chip => chip.id)).toEqual([
      'full',
      'half',
    ]);
  });
  it('loads open items through peopleReadService and computes pick allocations', async () => {
    const accountId = asAccountId('account');
    const personId = asPersonId('person');
    const spy = jest.spyOn(peopleReadService, 'observeOpenItems').mockReturnValue(
      of(
        ['a', 'b'].map((id, index) => ({
          item: {
            id: asOpenItemId(id),
            accountId,
            personId,
            originatingJournalId: asJournalId('journal-' + id),
            direction: 'receivable' as const,
            journalDate: index + 1,
            createdAt: index + 1,
            originalAmount: 6,
            currencyCode: 'USD',
          },
          remainder: index ? 4 : 2,
        })),
      ),
    );
    const { result } = renderHook(() =>
      useTransferOpenItems({
        workplaceId: asWorkplaceId('w'),
        personId,
        accountId,
        transferAmount: 5,
        precision: 2,
      }),
    );
    await waitFor(() => expect(result.current.openItems).toHaveLength(2));
    act(() => result.current.setAllocationMode('pick'));
    act(() => {
      result.current.toggleItem(asOpenItemId('a'));
      result.current.toggleItem(asOpenItemId('b'));
    });
    expect(result.current.selectedAllocations).toEqual([
      { openItemId: 'a', amount: 2 },
      { openItemId: 'b', amount: 3 },
    ]);
    spy.mockRestore();
  });
});
