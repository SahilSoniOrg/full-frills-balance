import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import { DisplayTransaction } from '@/src/types/domainReadModels';

import { buildJournalSplitItems } from '../journalDetailsPresentation';
import { Icon } from '@/src/types/domainIcons';

describe('buildJournalSplitItems', () => {
  it('maps split lines and delegates account navigation', () => {
    const onAccountPress = jest.fn();
    const accountId = 'cash' as AccountId;
    const transactions = [
      {
        id: 'tx-1',
        accountId,
        accountName: '',
        accountType: AccountType.ASSET,
        accountColor: '#3366FF',
        transactionType: TransactionType.DEBIT,
        amount: 25,
        currencyCode: 'USD',
      },
    ] as DisplayTransaction[];

    const [item] = buildJournalSplitItems(transactions, onAccountPress);

    expect(item).toMatchObject({
      id: 'tx-1',
      accountId,
      accountName: 'Unknown Account',
      accountColor: '#3366FF',
      transactionType: TransactionType.DEBIT,
      amount: 25,
      currencyCode: 'USD',
      icon: Icon.Wallet,
      tint: 'asset',
    });

    item.onPress();
    expect(onAccountPress).toHaveBeenCalledWith(accountId);
  });
});
