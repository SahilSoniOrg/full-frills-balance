import { AccountType, AccountId, DisplayTransaction } from '@/src/types/domain';

import { buildJournalSplitItems } from '../journalDetailsSplitItems';

describe('journalDetailsSplitItems', () => {
  it('maps split lines and delegates account navigation', () => {
    const onAccountPress = jest.fn();
    const accountId = 'cash' as AccountId;
    const transactions = [
      {
        id: 'tx-1',
        accountId,
        accountName: '',
        accountType: AccountType.ASSET,
        transactionType: 'DEBIT',
        amount: 25,
        currencyCode: 'USD',
      },
    ] as DisplayTransaction[];

    const [item] = buildJournalSplitItems(transactions, onAccountPress);

    expect(item).toMatchObject({
      id: 'tx-1',
      accountId,
      accountName: 'Unknown Account',
      transactionType: 'To • DEBIT',
      amount: 25,
      currencyCode: 'USD',
      amountPrefix: '+',
      fallbackIcon: 'wallet',
      iconColor: 'income',
    });

    item.onPress();
    expect(onAccountPress).toHaveBeenCalledWith(accountId);
  });
});
