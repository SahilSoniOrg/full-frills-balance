import { render, fireEvent } from '@testing-library/react-native';
import { TransferOpenItemsCard } from '../components/TransferOpenItemsCard';

describe('TransferOpenItemsCard', () => {
  it('forwards quick fill, mode and item selection actions', () => {
    const quick = jest.fn(),
      mode = jest.fn(),
      toggle = jest.fn();
    const { getByText } = render(
      <TransferOpenItemsCard
        items={[]}
        totalOpenRemainder={10}
        currencyCode="USD"
        quickFillChips={[{ id: 'full', label: 'Full balance', amount: 10 }]}
        allocationMode="fifo"
        onAllocationModeChange={mode}
        selectedItemIds={{}}
        onToggleItem={toggle}
        onQuickFillAmount={quick}
      />,
    );
    fireEvent.press(getByText('Full balance'));
    fireEvent.press(getByText('Pick items'));
    expect(quick).toHaveBeenCalledWith('10');
    expect(mode).toHaveBeenCalledWith('pick');
  });
});
