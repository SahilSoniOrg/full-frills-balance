import { renderHook } from '@/src/utils/test-utils';
import { AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { useAccountDetailsActions } from '../useAccountDetailsActions';

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { toJournalEntry: jest.fn(), toSimpleJournalEntry: jest.fn() },
}));

function actions(accountType: AccountType) {
  const { result } = renderHook(() =>
    useAccountDetailsActions({
      accountId: asAccountId('account'),
      account: null,
      accountType,
      isDeleted: false,
      dateRange: null,
      recoverAction: jest.fn(),
      reconcileAccount: jest.fn(),
    }),
  );
  return result.current;
}

describe('account details transaction prefill', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the expense category as the spending destination', () => {
    actions(AccountType.EXPENSE).onAddPress();
    expect(AppNavigation.toSimpleJournalEntry).toHaveBeenCalledWith('expense', {
      destinationAccountId: 'account',
    });
  });

  it('uses the income category as the source in income mode', () => {
    actions(AccountType.INCOME).onAddPress();
    expect(AppNavigation.toSimpleJournalEntry).toHaveBeenCalledWith('income', {
      sourceAccountId: 'account',
    });
  });

  it('keeps the account as the source for an asset', () => {
    actions(AccountType.ASSET).onAddPress();
    expect(AppNavigation.toJournalEntry).toHaveBeenCalledWith({ sourceAccountId: 'account' });
  });
});
