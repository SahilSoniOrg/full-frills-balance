import { AccountSummaryCard } from '@/src/features/accounts/components/AccountSummaryCard';
import { AccountType } from '@/src/types/enums';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import type { ComponentProps } from 'react';

type Props = ComponentProps<typeof AccountSummaryCard>;

function renderCard(overrides: Partial<Props> = {}) {
  const props: Props = {
    accountName: 'Liq',
    accountIcon: null,
    accountType: AccountType.ASSET,
    accountSubtypeLabel: 'Bank Checking',
    accountTypeVariant: 'asset',
    isParent: false,
    ancestorPath: [],
    onOpenAncestor: jest.fn(),
    isDeleted: false,
    isArchived: false,
    subAccountCount: 0,
    onShowSubAccounts: jest.fn(),
    balanceAmount: 375340.2,
    secondaryBalances: [],
    transactionCountText: '1,461 entries',
    onAuditPress: jest.fn(),
    onReconcile: jest.fn(),
    unreconciledCount: 0,
    currencyCode: 'INR',
    reconciledAtMs: null,
    ...overrides,
  };
  render(<AccountSummaryCard {...props} />);
  return props;
}

describe('AccountSummaryCard', () => {
  it('leads with the balance and shows one type tag, preferring the subtype', () => {
    renderCard();

    expect(screen.getByText('Current balance')).toBeTruthy();
    expect(screen.getByTestId('account-balance')).toBeTruthy();
    expect(screen.queryByText('Asset')).toBeNull();
    expect(screen.getByText('Bank Checking')).toBeTruthy();
    expect(screen.getByText('1,461 entries')).toBeTruthy();
  });

  it.each([0, 3])('shows the verification cutoff with %i new entries', unreconciledCount => {
    const props = renderCard({ unreconciledCount, reconciledAtMs: Date.now() });

    expect(screen.getByText('Reconciled through')).toBeTruthy();
    expect(screen.getByLabelText(/^Reconciled through /)).toBeTruthy();
    expect(screen.queryByText('Statement matched')).toBeNull();
    expect(screen.queryByText(/entries since last match/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Reconcile' })).toBeTruthy();
    fireEvent.press(screen.getByTestId('reconcile-button'));
    expect(props.onReconcile).toHaveBeenCalled();
  });

  it('says when the account has never been verified', () => {
    renderCard();

    expect(screen.getByText('Not reconciled yet')).toBeTruthy();
    expect(screen.getByLabelText('Not reconciled yet, Check against your statement.')).toBeTruthy();
  });

  it('hides reconcile when the account cannot be matched', () => {
    renderCard({ onReconcile: undefined });

    expect(screen.queryByTestId('reconcile-button')).toBeNull();
  });

  it('prevents verifying a placeholder balance while the balance is loading', () => {
    const props = renderCard({ balanceAmount: null });

    expect(screen.getByRole('button', { name: 'Reconcile' })).toBeDisabled();
    fireEvent.press(screen.getByTestId('reconcile-button'));
    expect(props.onReconcile).not.toHaveBeenCalled();
  });

  it('opens sub-accounts from the group action', () => {
    const props = renderCard({ isParent: true, subAccountCount: 3 });

    fireEvent.press(screen.getByLabelText('Show 3 sub-accounts'));
    expect(props.onShowSubAccounts).toHaveBeenCalled();
  });
});
