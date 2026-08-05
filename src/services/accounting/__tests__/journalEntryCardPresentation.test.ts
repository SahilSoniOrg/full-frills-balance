import { AccountType } from '@/src/data/models/Account';
import {
  journalDisplayTypeChrome,
  ledgerLineChrome,
  mapJournalToTimelineItem,
} from '@/src/services/accounting/journalTimelineMapper';
import { mapJournalToEntryCardProps } from '@/src/adapters/journalEntryCardAdapter';
import { AccountId, JournalDisplayType, JournalId, SemanticType } from '@/src/types/domain';

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

  it('journal card adapter preserves badge labels', () => {
    const card = mapJournalToEntryCardProps({
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

  it('mapJournalToTimelineItem with viewer uses leg amount not total', () => {
    const item = mapJournalToTimelineItem(
      {
        id: 'j1' as JournalId,
        journalDate: Date.now(),
        description: 'Split transfer',
        currencyCode: 'USD',
        status: 'POSTED',
        totalAmount: 100,
        transactionCount: 2,
        displayType: JournalDisplayType.TRANSFER,
        accounts: [
          {
            id: 'a1' as AccountId,
            name: 'Checking',
            accountType: AccountType.ASSET,
            role: 'SOURCE',
            amount: 40,
          },
          {
            id: 'a2' as AccountId,
            name: 'Savings',
            accountType: AccountType.ASSET,
            role: 'DESTINATION',
            amount: 60,
          },
        ],
        semanticType: SemanticType.TRANSFER,
        semanticLabel: 'Transfer',
      },
      { accountId: 'a1' as AccountId },
    );

    expect(item.amount).toBe(40);
    expect(item.amount).not.toBe(100);
  });

  it('mapJournalToTimelineItem with viewer shows counterparty badges only', () => {
    const item = mapJournalToTimelineItem(
      {
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
      },
      { accountId: 'a1' as AccountId },
    );

    expect(item.badges.map(b => b.text)).toEqual(['Food']);
    expect(item.badges.map(b => b.text)).not.toContain('Checking');
    expect(item.badges.map(b => b.text)).not.toContain('From: Checking');
    expect(item.badges.map(b => b.text)).not.toContain('To: Food');
  });

  it('mapJournalToTimelineItem with viewer uses ledger line chrome based on role', () => {
    const expenseFromSource = mapJournalToTimelineItem(
      {
        id: 'j1' as JournalId,
        journalDate: Date.now(),
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
      },
      { accountId: 'a1' as AccountId },
    );

    expect(expenseFromSource.presentation.typeIcon).toBe('arrowDown');
    expect(expenseFromSource.presentation.amountPrefix).toBe('− ');

    const incomeToDestination = mapJournalToTimelineItem(
      {
        id: 'j2' as JournalId,
        journalDate: Date.now(),
        currencyCode: 'USD',
        status: 'POSTED',
        totalAmount: 50,
        transactionCount: 2,
        displayType: JournalDisplayType.INCOME,
        accounts: [
          {
            id: 'a1' as AccountId,
            name: 'Checking',
            accountType: AccountType.ASSET,
            role: 'DESTINATION',
          },
          {
            id: 'a2' as AccountId,
            name: 'Salary',
            accountType: AccountType.INCOME,
            role: 'SOURCE',
          },
        ],
      },
      { accountId: 'a1' as AccountId },
    );

    expect(incomeToDestination.presentation.typeIcon).toBe('arrowUp');
    expect(incomeToDestination.presentation.amountPrefix).toBe('+ ');
  });
});
