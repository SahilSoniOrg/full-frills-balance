import { fireEvent, render } from '@/src/testing/render';
import { AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import { PersonLinkedAccountsSection } from '../PersonLinkedAccountsSection';

describe('PersonLinkedAccountsSection', () => {
  it('shows receivable and expense chips with amounts even when receivable matches the hero', () => {
    const onLink = jest.fn();
    const onOpenAccount = jest.fn();
    const onUnlinkAccount = jest.fn();
    const { queryByText, getByLabelText, getByTestId } = render(
      <PersonLinkedAccountsSection
        personName="Dad"
        onLink={onLink}
        onOpenAccount={onOpenAccount}
        onUnlinkAccount={onUnlinkAccount}
        formatAmount={(amount, currency) => `${currency} ${amount.toFixed(2)}`}
        linkedAccounts={[
          {
            account: {
              id: 'recv' as AccountId,
              name: 'Dad (Receivable · INR)',
              accountType: AccountType.ASSET,
              currencyCode: 'INR',
            },
            unassignedState: { ledgerBalanceInNormalDirection: 200 },
          },
          {
            account: {
              id: 'exp' as AccountId,
              name: 'Dad',
              accountType: AccountType.EXPENSE,
              currencyCode: 'INR',
            },
            unassignedState: { ledgerBalanceInNormalDirection: 4499840.49 },
          },
        ]}
      />,
    );

    expect(queryByText('Expense')).toBeNull();
    expect(queryByText('Receivable')).toBeNull();
    expect(
      getByLabelText(/Money you'll get back: INR 200\.00\. Open account for Dad/),
    ).toBeTruthy();
    expect(
      getByLabelText(/Money you won't get back: INR 4499840.49\. Open account for Dad/),
    ).toBeTruthy();

    fireEvent.press(getByTestId('person-linked-account-recv'));
    expect(onOpenAccount).toHaveBeenCalledWith('recv');

    fireEvent(getByTestId('person-linked-account-recv'), 'onLongPress');
    expect(onUnlinkAccount).toHaveBeenCalledWith('recv');
  });
});
