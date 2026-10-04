import { AccountType, JournalDisplayType, SemanticType } from '@/src/types/enums';
import { AccountId, JournalId } from '@/src/types/ids';

import {
  journalDisplayTypeChrome,
  ledgerLineChrome,
  mapJournalToEntryCardProps,
  mapJournalToTimelineItem,
} from '@/src/services/journal/journalTimelinePresentation';

describe('journalTimelinePresentation', () => {
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

  it('mapJournalToTimelineItem builds source and destination account groups', () => {
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

    expect(item.accountFlow.primaryAccount?.name).toBe('Checking');
    expect(item.accountFlow.destinations.map(leg => leg.name)).toEqual(['Food']);
    expect(item.presentation.label).toBeTruthy();
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

  it('labels a scoped line in its saved currency and the whole journal in journal currency', () => {
    const journal = {
      id: 'j1' as JournalId,
      journalDate: Date.now(),
      currencyCode: 'INR',
      status: 'POSTED',
      totalAmount: 800,
      transactionCount: 2,
      displayType: JournalDisplayType.TRANSFER,
      accounts: [
        {
          id: 'usd' as AccountId,
          name: 'Dollar account',
          accountType: AccountType.ASSET,
          role: 'SOURCE' as const,
          amount: 10,
          currencyCode: 'USD',
        },
        {
          id: 'inr' as AccountId,
          name: 'Rupee account',
          accountType: AccountType.ASSET,
          role: 'DESTINATION' as const,
          amount: 800,
          currencyCode: 'INR',
        },
      ],
    };

    expect(mapJournalToTimelineItem(journal).amount).toBe(800);
    expect(mapJournalToTimelineItem(journal).currencyCode).toBe('INR');
    const scoped = mapJournalToTimelineItem(journal, { accountId: 'usd' as AccountId });
    expect(scoped.amount).toBe(10);
    expect(scoped.currencyCode).toBe('USD');
  });

  it('mapJournalToTimelineItem with viewer retains the viewed account and its peers', () => {
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

    expect(item.accountFlow.primaryAccount?.name).toBe('Checking');
    expect(item.accountFlow.sources).toEqual([]);
    expect(item.accountFlow.destinations.map(leg => leg.name)).toEqual(['Food']);
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

  it('mapJournalToEntryCardProps preserves journal title and account presentation', () => {
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
    expect(card.accountFlow?.primaryAccount?.name).toBe('Checking');
  });

  it('mapJournalToEntryCardProps normalizes invalid stored icons on structured legs', () => {
    const card = mapJournalToEntryCardProps({
      id: 'j1' as JournalId,
      journalDate: Date.now(),
      currencyCode: 'USD',
      status: 'POSTED',
      totalAmount: 100,
      transactionCount: 4,
      displayType: JournalDisplayType.EXPENSE,
      accounts: [
        {
          id: 'bank' as AccountId,
          name: 'Bank',
          accountType: AccountType.ASSET,
          role: 'SOURCE',
          amount: 100,
          currencyCode: 'USD',
          icon: 'invalid-stored-icon',
          color: '#CDAA6B',
        },
        ...['Food', 'Travel', 'Fees'].map((name, index) => ({
          id: name as AccountId,
          name,
          accountType: AccountType.EXPENSE,
          role: 'DESTINATION' as const,
          amount: 10 + index,
          currencyCode: 'USD',
          color: '#65C6AD',
        })),
      ],
    });
    expect(card.accountFlow?.primaryAccount?.icon).toBeUndefined();
    expect(card.accountFlow?.primaryAccount?.fallbackIcon).toBeDefined();
    expect(card.accountFlow?.primaryAccount?.color).toBe('#CDAA6B');
    expect(card.accountFlow?.destinations.every(leg => leg.color === '#65C6AD')).toBe(true);
    expect(card.accountFlow?.destinations.map(leg => leg.name)).toEqual(['Fees', 'Travel', 'Food']);
    expect(card.amount).toBe(100);
    expect(card.accountFlow?.primaryAccount).not.toHaveProperty('amount');
    expect(card.accountFlow?.primaryAccount).not.toHaveProperty('currencyCode');
  });
});
