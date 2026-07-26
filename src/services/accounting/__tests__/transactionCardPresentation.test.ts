import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import {
  journalDisplayTypeChrome,
  ledgerLineChrome,
  mapJournalToTimelineItem,
  mapLedgerTransactionToTimelineItem,
} from '@/src/services/accounting/journalTimelineMapper';
import { mapJournalToCardProps } from '@/src/adapters/transactionCardAdapter';
import {
  AccountId,
  JournalDisplayType,
  JournalId,
  SemanticType,
  TransactionId,
} from '@/src/types/domain';

describe('journalTimelineMapper', () => {
  it('journalDisplayTypeChrome maps expense to down arrow', () => {
    const chrome = journalDisplayTypeChrome(JournalDisplayType.EXPENSE);
    expect(chrome.typeIcon).toBe('arrowDown');
    expect(chrome.amountPrefix).toBe('− ');
  });

  it('ledgerLineChrome maps increase to up arrow', () => {
    const chrome = ledgerLineChrome(true);
    expect(chrome.typeIcon).toBe('arrowUp');
    expect(chrome.amountPrefix).toBe('+ ');
  });

  it('mapJournalToTimelineItem builds from/to account badges', () => {
    const item = mapJournalToTimelineItem({
      id: 'j1' as JournalId,
      journalDate: Date.now(),
      description: 'Lunch',
      currencyCode: 'USD',
      status: 'POSTED',
      totalAmount: 25,
      transactionCount: 2,
      displayType: JournalDisplayType.EXPENSE,
      accounts: [
        {
          id: 'a1' as AccountId,
          name: 'Checking',
          accountType: AccountType.ASSET,
          role: 'SOURCE',
        },
        {
          id: 'a2' as AccountId,
          name: 'Food',
          accountType: AccountType.EXPENSE,
          role: 'DESTINATION',
        },
      ],
      semanticType: SemanticType.PURCHASE,
      semanticLabel: 'Purchase',
    });

    expect(item.badges.map(b => b.text)).toEqual(['From: Checking', 'To: Food']);
    expect(item.presentation.label).toBeTruthy();
  });

  it('mapLedgerTransactionToTimelineItem uses counterparty badges', () => {
    const item = mapLedgerTransactionToTimelineItem({
      id: 'tx1' as TransactionId,
      accountId: 'a1' as AccountId,
      amount: 25,
      currencyCode: 'USD',
      transactionType: TransactionType.DEBIT,
      transactionDate: Date.now(),
      displayTitle: 'Lunch',
      journalDescription: 'Lunch',
      displayType: JournalDisplayType.EXPENSE,
      accountName: 'Checking',
      accountType: AccountType.ASSET,
      isIncrease: false,
      counterAccounts: [{ id: 'a2' as AccountId, name: 'Food', accountType: AccountType.EXPENSE }],
    });

    expect(item.badges.map(b => b.text)).toEqual(['Food']);
    expect(item.badges.map(b => b.text)).not.toContain('Checking');
  });

  it('journal card adapter preserves badge labels', () => {
    const card = mapJournalToCardProps({
      id: 'j1' as JournalId,
      journalDate: Date.now(),
      description: 'Lunch',
      currencyCode: 'USD',
      status: 'POSTED',
      totalAmount: 25,
      transactionCount: 2,
      displayType: JournalDisplayType.EXPENSE,
      accounts: [
        {
          id: 'a1' as AccountId,
          name: 'Checking',
          accountType: AccountType.ASSET,
          role: 'SOURCE',
        },
      ],
      semanticType: SemanticType.PURCHASE,
      semanticLabel: 'Purchase',
    });
    expect(card.title).toBe('Lunch');
  });
});
