import { mapJournalToTimelineItem } from '../journalTimelinePresentation';
import { journalsToTimelineRows } from '../journalTimelineRows';
import { AccountType, JournalDisplayType, SemanticType } from '@/src/types/enums';
import { asAccountId, asJournalId, asTransactionId } from '@/src/types/ids';
import type { EnrichedJournal } from '@/src/types/domainReadModels';

function account(
  id: string,
  role: EnrichedJournal['accounts'][number]['role'],
  amount?: number,
  currencyCode = 'USD',
  exchangeRate?: number,
): EnrichedJournal['accounts'][number] {
  return {
    id: asAccountId(id),
    transactionId: asTransactionId(`posting-${id}`),
    name: id,
    accountType: role === 'SOURCE' ? AccountType.ASSET : AccountType.EXPENSE,
    role,
    amount,
    currencyCode,
    exchangeRate,
  };
}

function journal(accounts: EnrichedJournal['accounts'], currencyCode = 'USD'): EnrichedJournal {
  return {
    id: asJournalId('journal'),
    journalDate: 1_700_000_000_000,
    description: 'Split purchase',
    currencyCode,
    status: 'POSTED',
    totalAmount: 1000,
    transactionCount: accounts.length,
    displayType: JournalDisplayType.EXPENSE,
    accounts,
  };
}

describe('journal account flow', () => {
  it('selects the largest source and retains every source and destination', () => {
    const original = journal([
      account('cash', 'SOURCE', 200),
      account('hotel', 'DESTINATION', 200),
      account('checking', 'SOURCE', 800),
      account('flights', 'DESTINATION', 700),
      account('fees', 'DESTINATION', 100),
    ]);
    const item = mapJournalToTimelineItem(original);
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
    const item = mapJournalToTimelineItem(
      journal(
        [
          account('rupee-cash', 'SOURCE', 500, 'INR'),
          account('dollar-wallet', 'SOURCE', 100, 'USD', 80),
          account('food', 'DESTINATION', 8500, 'INR'),
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
        account('z-dollar', 'SOURCE', 100, 'USD', rate),
        account('a-rupee', 'SOURCE', 500, 'INR'),
      ];
      const forward = mapJournalToTimelineItem(journal(accounts, 'INR')).accountFlow;
      const reversed = mapJournalToTimelineItem(
        journal([...accounts].reverse(), 'INR'),
      ).accountFlow;
      expect(forward?.primaryAccount?.name).toBe('a-rupee');
      expect(forward).toEqual(reversed);
    },
  );

  it('breaks equal contribution ties by account and posting identity', () => {
    const legs = [account('z-cash', 'SOURCE', 50), account('a-bank', 'SOURCE', 50)];
    expect(mapJournalToTimelineItem(journal(legs)).accountFlow?.primaryAccount?.name).toBe(
      'a-bank',
    );
    expect(
      mapJournalToTimelineItem(journal([...legs].reverse())).accountFlow?.primaryAccount?.name,
    ).toBe('a-bank');
  });

  it('uses stable ordering for missing or invalid monetary metadata', () => {
    const missingCurrency = { ...account('cash', 'SOURCE', 50), currencyCode: undefined };
    const flow = mapJournalToTimelineItem(
      journal([
        missingCurrency,
        account('food', 'DESTINATION'),
        account('bad-value', 'DESTINATION', Number.NaN),
        account('unknown', 'NEUTRAL', 10),
      ]),
    ).accountFlow;
    expect(flow.primaryAccount?.name).toBe('cash');
    expect(flow.destinations.map(leg => leg.name)).toEqual(['bad-value', 'food']);
    expect(flow.showCurrencyCodes).toBe(false);
    expect(flow?.neutral[0].name).toBe('unknown');
  });

  it('uses the viewed source amount and retains every peer account', () => {
    const item = mapJournalToTimelineItem(
      journal([
        account('checking', 'SOURCE', 600),
        account('credit', 'SOURCE', 400),
        account('flights', 'DESTINATION', 800),
        account('hotel', 'DESTINATION', 200),
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
      ...journal(
        [account('dollar', 'SOURCE', 100, 'USD', 80), account('rupee', 'DESTINATION', 8000, 'INR')],
        'INR',
      ),
      displayType: JournalDisplayType.TRANSFER,
    };
    const item = mapJournalToTimelineItem(original, { accountId: asAccountId('rupee') });
    expect(item.amount).toBe(8000);
    expect(item.currencyCode).toBe('INR');
    expect(item.presentation.amountPrefix).toBe('+ ');
    expect(item.accountFlow?.primaryAccount?.role).toBe('DESTINATION');
    expect(item.accountFlow.sources[0].name).toBe('dollar');
    expect(item.accountFlow?.destinations).toEqual([]);
  });

  it('selects the exact posting when an account occurs more than once', () => {
    const first = account('checking', 'SOURCE', 40);
    const second = {
      ...account('checking', 'SOURCE', 60),
      transactionId: asTransactionId('second'),
    };
    const original = journal([first, second, account('food', 'DESTINATION', 100)]);
    const rows = journalsToTimelineRows([original], { viewer: { accountId: first.id } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.listId)).size).toBe(2);
    expect(rows.map(row => mapJournalToTimelineItem(row.journal, row.viewer).amount)).toEqual([
      40, 60,
    ]);
    expect(rows.every(row => row.selectionId === original.id)).toBe(true);
  });

  it('falls back to whole-journal context for a stale account or posting scope', () => {
    const original = journal([
      account('checking', 'SOURCE', 100),
      account('food', 'DESTINATION', 100),
    ]);
    expect(mapJournalToTimelineItem(original, { accountId: asAccountId('missing') })).toEqual(
      mapJournalToTimelineItem(original),
    );
    expect(
      mapJournalToTimelineItem(original, {
        accountId: asAccountId('checking'),
        transactionId: asTransactionId('missing'),
      }),
    ).toEqual(mapJournalToTimelineItem(original));
  });

  it('keeps debt payment semantics without a redundant visible badge', () => {
    const original = {
      ...journal([account('checking', 'SOURCE', 100), account('loan', 'DESTINATION', 100)]),
      semanticType: SemanticType.DEBT_PAYMENT,
    };
    const item = mapJournalToTimelineItem(original);
    expect(item.presentation.showTypeBadge).toBe(false);
    expect(item.presentation.label).toBe('Debt Payment');
  });
});
