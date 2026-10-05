import { AccountType, JournalDisplayType, SemanticType } from '@/src/types/enums';
import { AccountId, JournalId, asAccountId, asTransactionId } from '@/src/types/ids';
import type { EnrichedJournal } from '@/src/types/domainReadModels';

import {
  journalDisplayTypeChrome,
  ledgerLineChrome,
  mapJournalToEntryCardProps,
} from '@/src/services/journal/journalTimelinePresentation';
import { journalsToTimelineRows } from '@/src/services/journal/journalTimelineRows';
import {
  timelineAccount,
  timelineJournal,
} from '@/src/services/journal/__tests__/journalTimelinePresentation.test.helpers';

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

  it('mapJournalToEntryCardProps builds source and destination account groups', () => {
    const item = mapJournalToEntryCardProps({
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

  it('mapJournalToEntryCardProps with viewer uses leg amount not total', () => {
    const item = mapJournalToEntryCardProps(
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

    expect(mapJournalToEntryCardProps(journal).amount).toBe(800);
    expect(mapJournalToEntryCardProps(journal).currencyCode).toBe('INR');
    const scoped = mapJournalToEntryCardProps(journal, { accountId: 'usd' as AccountId });
    expect(scoped.amount).toBe(10);
    expect(scoped.currencyCode).toBe('USD');
  });

  it('mapJournalToEntryCardProps with viewer retains the viewed account and its peers', () => {
    const item = mapJournalToEntryCardProps(
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

  it('mapJournalToEntryCardProps with viewer uses ledger line chrome based on role', () => {
    const expenseFromSource = mapJournalToEntryCardProps(
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

    const incomeToDestination = mapJournalToEntryCardProps(
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

describe('mapJournalToEntryCardProps account flow', () => {
  it('selects the largest source and retains every source and destination', () => {
    const original = timelineJournal([
      timelineAccount('cash', 'SOURCE', 200),
      timelineAccount('hotel', 'DESTINATION', 200),
      timelineAccount('checking', 'SOURCE', 800),
      timelineAccount('flights', 'DESTINATION', 700),
      timelineAccount('fees', 'DESTINATION', 100),
    ]);
    const item = mapJournalToEntryCardProps(original);
    expect(item.accountFlow?.primaryAccount?.name).toBe('checking');
    expect(item.accountFlow?.sources.map(leg => leg.name)).toEqual(['cash']);
    expect(item.accountFlow?.destinations.map(leg => leg.name)).toEqual([
      'flights',
      'hotel',
      'fees',
    ]);
    expect(original.accounts[0].name).toBe('cash');
  });

  it('ranks contributions using saved FX rather than raw currency units', () => {
    const item = mapJournalToEntryCardProps(
      timelineJournal(
        [
          timelineAccount('rupee-cash', 'SOURCE', 500, 'INR'),
          timelineAccount('dollar-wallet', 'SOURCE', 100, 'USD', 80),
          timelineAccount('food', 'DESTINATION', 8500, 'INR'),
        ],
        'INR',
      ),
    );
    expect(item.accountFlow.primaryAccount?.name).toBe('dollar-wallet');
    expect(item.accountFlow.sources.map(leg => leg.name)).toEqual(['rupee-cash']);
    expect(item.accountFlow?.showCurrencyCodes).toBe(true);
    expect(item.currencyCode).toBe('INR');
  });

  it.each([undefined, 0, -1, Number.NaN])(
    'uses stable identity order for an unavailable foreign rate (%s)',
    rate => {
      const accounts = [
        timelineAccount('z-dollar', 'SOURCE', 100, 'USD', rate),
        timelineAccount('a-rupee', 'SOURCE', 500, 'INR'),
      ];
      const forward = mapJournalToEntryCardProps(timelineJournal(accounts, 'INR')).accountFlow;
      const reversed = mapJournalToEntryCardProps(
        timelineJournal([...accounts].reverse(), 'INR'),
      ).accountFlow;
      expect(forward?.primaryAccount?.name).toBe('a-rupee');
      expect(forward).toEqual(reversed);
    },
  );

  it('breaks equal contribution ties by account and posting identity', () => {
    const legs = [timelineAccount('z-cash', 'SOURCE', 50), timelineAccount('a-bank', 'SOURCE', 50)];
    expect(
      mapJournalToEntryCardProps(timelineJournal(legs)).accountFlow?.primaryAccount?.name,
    ).toBe('a-bank');
    expect(
      mapJournalToEntryCardProps(timelineJournal([...legs].reverse())).accountFlow?.primaryAccount
        ?.name,
    ).toBe('a-bank');
  });

  it('uses stable ordering for missing or invalid monetary metadata', () => {
    const missingCurrency = { ...timelineAccount('cash', 'SOURCE', 50), currencyCode: undefined };
    const flow = mapJournalToEntryCardProps(
      timelineJournal([
        missingCurrency,
        timelineAccount('food', 'DESTINATION'),
        timelineAccount('bad-value', 'DESTINATION', Number.NaN),
        timelineAccount('unknown', 'NEUTRAL', 10),
      ]),
    ).accountFlow;
    expect(flow.primaryAccount?.name).toBe('cash');
    expect(flow.destinations.map(leg => leg.name)).toEqual(['bad-value', 'food']);
    expect(flow.showCurrencyCodes).toBe(false);
    expect(flow?.neutral[0].name).toBe('unknown');
  });

  it('uses the viewed source amount and retains every peer account', () => {
    const item = mapJournalToEntryCardProps(
      timelineJournal([
        timelineAccount('checking', 'SOURCE', 600),
        timelineAccount('credit', 'SOURCE', 400),
        timelineAccount('flights', 'DESTINATION', 800),
        timelineAccount('hotel', 'DESTINATION', 200),
      ]),
      { accountId: asAccountId('credit') },
    );
    expect(item.amount).toBe(400);
    expect(item.presentation.amountPrefix).toBe('− ');
    expect(item.accountFlow?.primaryAccount?.name).toBe('credit');
    expect(item.accountFlow?.sources.map(leg => leg.name)).toEqual(['checking']);
    expect(item.accountFlow.destinations.map(leg => leg.name)).toEqual(['flights', 'hotel']);
  });

  it('uses the destination perspective and native currency for incoming transfers', () => {
    const original = {
      ...timelineJournal(
        [
          timelineAccount('dollar', 'SOURCE', 100, 'USD', 80),
          timelineAccount('rupee', 'DESTINATION', 8000, 'INR'),
        ],
        'INR',
      ),
      displayType: JournalDisplayType.TRANSFER,
    };
    const item = mapJournalToEntryCardProps(original, { accountId: asAccountId('rupee') });
    expect(item.amount).toBe(8000);
    expect(item.currencyCode).toBe('INR');
    expect(item.presentation.amountPrefix).toBe('+ ');
    expect(item.accountFlow?.primaryAccount?.role).toBe('DESTINATION');
    expect(item.accountFlow.sources[0].name).toBe('dollar');
    expect(item.accountFlow?.destinations).toEqual([]);
  });

  it('selects the exact posting when an account occurs more than once', () => {
    const first = timelineAccount('checking', 'SOURCE', 40);
    const second = {
      ...timelineAccount('checking', 'SOURCE', 60),
      transactionId: asTransactionId('second'),
    };
    const original = timelineJournal([first, second, timelineAccount('food', 'DESTINATION', 100)]);
    const rows = journalsToTimelineRows([original], { viewer: { accountId: first.id } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.listId)).size).toBe(2);
    expect(rows.map(row => mapJournalToEntryCardProps(row.journal, row.viewer).amount)).toEqual([
      40, 60,
    ]);
    expect(rows.every(row => row.selectionId === original.id)).toBe(true);
  });

  it('falls back to whole-journal context for a stale account or posting scope', () => {
    const original = timelineJournal([
      timelineAccount('checking', 'SOURCE', 100),
      timelineAccount('food', 'DESTINATION', 100),
    ]);
    expect(mapJournalToEntryCardProps(original, { accountId: asAccountId('missing') })).toEqual(
      mapJournalToEntryCardProps(original),
    );
    expect(
      mapJournalToEntryCardProps(original, {
        accountId: asAccountId('checking'),
        transactionId: asTransactionId('missing'),
      }),
    ).toEqual(mapJournalToEntryCardProps(original));
  });

  it('keeps debt payment semantics without a redundant visible badge', () => {
    const original = {
      ...timelineJournal([
        timelineAccount('checking', 'SOURCE', 100),
        timelineAccount('loan', 'DESTINATION', 100),
      ]),
      semanticType: SemanticType.DEBT_PAYMENT,
    };
    const item = mapJournalToEntryCardProps(original);
    expect(item.presentation.showTypeBadge).toBe(false);
    expect(item.presentation.label).toBe('Debt Payment');
  });
});

describe('journalsToTimelineRows expandAccountIds', () => {
  const journal: EnrichedJournal = {
    id: 'j1' as JournalId,
    journalDate: 1,
    description: 'Split lunch',
    currencyCode: 'USD',
    status: 'POSTED',
    totalAmount: 100,
    transactionCount: 3,
    displayType: JournalDisplayType.EXPENSE,
    accounts: [
      {
        id: 'cash' as AccountId,
        name: 'Cash',
        accountType: AccountType.ASSET,
        role: 'SOURCE',
        amount: 100,
      },
      {
        id: 'food' as AccountId,
        name: 'Food',
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
        amount: 60,
      },
      {
        id: 'transport' as AccountId,
        name: 'Transport',
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
        amount: 40,
      },
    ],
  };

  it('creates one row per scoped leg with composite list ids when multiple legs match', () => {
    const rows = journalsToTimelineRows([journal], {
      expandAccountIds: ['food' as AccountId, 'transport' as AccountId],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].listId).toBe('j1_food');
    expect(rows[1].listId).toBe('j1_transport');
    expect(rows[0].selectionId).toBe('j1');
    expect(rows[0].viewer?.accountId).toBe('food');
  });

  it('uses journal id as list id when only one scoped leg matches', () => {
    const rows = journalsToTimelineRows([journal], {
      expandAccountIds: ['food' as AccountId],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].listId).toBe('j1');
    expect(rows[0].selectionId).toBe('j1');
  });
});
