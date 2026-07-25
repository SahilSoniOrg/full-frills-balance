import { AccountType } from '@/src/data/models/Account';
import {
  journalDisplayTypeChrome,
  ledgerLineChrome,
  mapJournalToCardProps,
  mapLedgerTransactionToCardProps,
} from '@/src/services/accounting/transactionCardPresentation';
import { JournalDisplayType, SemanticType } from '@/src/types/domain';

describe('transactionCardPresentation', () => {
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

  it('mapJournalToCardProps builds from/to account badges', () => {
    const card = mapJournalToCardProps({
      id: 'j1',
      journalDate: Date.now(),
      description: 'Lunch',
      currencyCode: 'USD',
      status: 'POSTED',
      totalAmount: 25,
      transactionCount: 2,
      displayType: JournalDisplayType.EXPENSE,
      accounts: [
        {
          id: 'a1',
          name: 'Checking',
          accountType: AccountType.ASSET,
          role: 'SOURCE',
        },
        {
          id: 'a2',
          name: 'Food',
          accountType: AccountType.EXPENSE,
          role: 'DESTINATION',
        },
      ],
      semanticType: SemanticType.PURCHASE,
      semanticLabel: 'Purchase',
    });

    expect(card.badges.map(b => b.text)).toEqual(['From: Checking', 'To: Food']);
    expect(card.presentation.label).toBeTruthy();
  });

  it('mapLedgerTransactionToCardProps uses counterparty badges', () => {
    const card = mapLedgerTransactionToCardProps({
      id: 'tx1',
      accountId: 'a1',
      amount: 25,
      currencyCode: 'USD',
      transactionType: 'DEBIT',
      transactionDate: Date.now(),
      displayTitle: 'Lunch',
      journalDescription: 'Lunch',
      displayType: JournalDisplayType.EXPENSE,
      accountName: 'Checking',
      accountType: AccountType.ASSET,
      isIncrease: false,
      counterAccounts: [{ id: 'a2', name: 'Food', accountType: AccountType.EXPENSE }],
    });

    expect(card.badges.map(b => b.text)).toEqual(['Food']);
    expect(card.badges.map(b => b.text)).not.toContain('Checking');
  });
});
