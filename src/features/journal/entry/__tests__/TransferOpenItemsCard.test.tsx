import { fireEvent, render } from '@/src/testing/render';
import { renderHook, act } from '@testing-library/react-native';
import { TransferOpenItemsCard } from '../components/TransferOpenItemsCard';
import { useTransferOpenItems } from '../hooks/useTransferOpenItems';

describe('TransferOpenItemsCard', () => {
  it('forwards quick fill and mode changes', () => {
    const quick = jest.fn(),
      mode = jest.fn();
    const { getByText } = render(
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
          { item: { id: 'a' as never, originalAmount: 8, currencyCode: 'USD' }, remainder: 3 },
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
    fireEvent.press(getByText(/Original/));
    expect(toggle).toHaveBeenCalledWith('a');
  });
  it('caps selected allocations at remainders and follows item order in pick mode', () => {
    const items = [
      { item: { id: 'a' as never, originalAmount: 5, currencyCode: 'USD' }, remainder: 2 },
      { item: { id: 'b' as never, originalAmount: 6, currencyCode: 'USD' }, remainder: 4 },
    ];
    const { result, rerender } = renderHook(
      ({ mode }) =>
        useTransferOpenItems({
          workplaceId: 'w' as never,
          workplaceCurrency: 'USD',
          transferAmountText: '5',
          currencyCode: 'USD',
        }),
      {},
    );
    act(() => {
      result.current.setSelectedItemIds({ a: true, b: true });
      result.current.setAllocationMode('pick');
    });
    expect(result.current.selectedAllocations).toEqual([
      { openItemId: 'a', amount: 2 },
      { openItemId: 'b', amount: 3 },
    ]);
    void items;
    void rerender;
  });
});
