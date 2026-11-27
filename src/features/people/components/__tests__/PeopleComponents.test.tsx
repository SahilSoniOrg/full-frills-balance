import { fireEvent, render } from '@/src/testing/render';
import { PersonBalanceBadge } from '../PersonBalanceBadge';
import { SplitBreakdownPreview } from '../SplitBreakdownPreview';
import { WeAreSettledPreviewModal } from '../WeAreSettledPreviewModal';

describe('people previews', () => {
  it('shows balances in native directions and converted estimate', () => {
    const { getByText } = render(
      <PersonBalanceBadge
        personName="Ari"
        summary={{
          personId: 'ari',
          currencies: [{ currencyCode: 'USD', owedToYou: 8, youOwe: 2, net: 6 }],
          convertedNet: {
            currencyCode: 'INR',
            amount: 500,
            isInformational: true,
            missingCurrencies: [],
          },
        }}
      />,
    );
    expect(getByText('Ari owes you USD 8.00')).toBeTruthy();
    expect(getByText('You owe Ari USD 2.00')).toBeTruthy();
    expect(getByText('Est. net ~INR 500.00')).toBeTruthy();
  });
  it('shows the exact split preview amounts', () => {
    const { getByTestId } = render(
      <SplitBreakdownPreview
        total="$10.00"
        userShare="$4.00"
        participants={[{ id: 'ari', name: 'Ari', owedAmount: '$6.00' }]}
      />,
    );
    expect(getByTestId('split-total')).toBeTruthy();
    expect(getByTestId('split-user-share')).toBeTruthy();
    expect(getByTestId('split-participant-ari')).toBeTruthy();
  });
  it('blocks confirmation when unassigned remainder is negative', () => {
    const onConfirm = jest.fn();
    const { getByText } = render(
      <WeAreSettledPreviewModal
        visible
        personName="Ari"
        summary={{ personId: 'ari', currencies: [] }}
        workplaceCurrency="USD"
        closingResidual={2}
        forgivenAccountName="Rounding"
        forgivenAccountType="Expense"
        blockedReason="Amount exceeds balance"
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    expect(getByText('Amount exceeds balance')).toBeTruthy();
    fireEvent.press(getByText('Confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
