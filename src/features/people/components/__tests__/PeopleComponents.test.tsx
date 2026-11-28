import { fireEvent, render } from '@/src/testing/render';
import { asPersonId } from '@/src/types/ids';
import { PersonBalanceBadge } from '../PersonBalanceBadge';
import { WeAreSettledPreviewModal } from '../WeAreSettledPreviewModal';

describe('people previews', () => {
  it('shows balances in native directions and converted estimate', () => {
    const { getByText } = render(
      <PersonBalanceBadge
        personName="Ari"
        summary={{
          personId: asPersonId('ari'),
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
    expect(getByText('Net: USD 6.00')).toBeTruthy();
    expect(getByText('Est. net ~INR 500.00')).toBeTruthy();
  });

  it('hides redundant net and same-currency estimate on a one-sided balance', () => {
    const { getByText, queryByText } = render(
      <PersonBalanceBadge
        personName="Dad"
        summary={{
          personId: asPersonId('dad'),
          currencies: [{ currencyCode: 'INR', owedToYou: 200, youOwe: 0, net: 200 }],
          convertedNet: {
            currencyCode: 'INR',
            amount: 200,
            isInformational: true,
            missingCurrencies: [],
          },
        }}
      />,
    );
    expect(getByText('Dad owes you INR 200.00')).toBeTruthy();
    expect(queryByText('Net: INR 200.00')).toBeNull();
    expect(queryByText('Est. net ~INR 200.00')).toBeNull();
  });
  it('blocks confirmation when unassigned remainder is negative', () => {
    const onConfirm = jest.fn();
    const { getByText } = render(
      <WeAreSettledPreviewModal
        visible
        personName="Ari"
        summary={{ personId: asPersonId('ari'), currencies: [] }}
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
  it('keeps settlement preview open and disables confirmation while the write is pending', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const { getByRole } = render(
      <WeAreSettledPreviewModal
        visible
        isConfirming
        personName="Ari"
        summary={{ personId: asPersonId('ari'), currencies: [] }}
        workplaceCurrency="USD"
        closingResidual={0}
        forgivenAccountName="Rounding"
        forgivenAccountType="Expense"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
