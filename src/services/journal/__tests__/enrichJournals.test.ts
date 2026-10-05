import type { JournalEnrichmentRow } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import { AccountType, JournalDisplayType, SemanticType, TransactionType } from '@/src/types/enums';
import {
  enrichJournals,
  enrichedJournalsAreEqual,
  journalEnrichmentFingerprint,
} from '@/src/services/journal/enrichJournals';

function journalStub(id: string) {
  return {
    id,
    journalDate: 1_700_000_000_000,
    description: 'Coffee',
    notes: 'note',
    currencyCode: 'USD',
    status: 'POSTED',
    totalAmount: 10,
    transactionCount: 2,
    plannedPaymentId: undefined,
  } as Parameters<typeof enrichJournals>[0][number];
}

function enrichmentRow(
  journalId: string,
  accountId: string,
  amount: number,
  transactionType: TransactionType,
  accountType: AccountType,
  accountName: string,
  currencyCode = 'USD',
): JournalEnrichmentRow {
  return {
    journal_id: journalId as JournalEnrichmentRow['journal_id'],
    account_id: accountId as JournalEnrichmentRow['account_id'],
    amount,
    account_currency_code: currencyCode,
    transaction_type: transactionType,
    account_name: accountName,
    account_type: accountType,
    account_icon: 'cart',
  };
}

describe('enrichJournals', () => {
  it('maps presenter fields and account legs from enrichment rows', () => {
    const journal = journalStub('j-1');
    const rows: JournalEnrichmentRow[] = [
      enrichmentRow('j-1', 'cash', 10, TransactionType.CREDIT, AccountType.ASSET, 'Cash'),
      enrichmentRow('j-1', 'food', 10, TransactionType.DEBIT, AccountType.EXPENSE, 'Food'),
    ];

    const enriched = enrichJournals([journal], rows);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].displayType).toBe(JournalDisplayType.EXPENSE);
    expect(enriched[0].semanticType).toBe(SemanticType.PURCHASE);
    expect(enriched[0].accounts).toEqual([
      expect.objectContaining({ id: 'cash', role: 'SOURCE', amount: 10 }),
      expect.objectContaining({ id: 'food', role: 'DESTINATION', amount: 10 }),
    ]);
  });

  it('sorts account legs by account id for stable enrichment order', () => {
    const journal = journalStub('j-1');
    const rows: JournalEnrichmentRow[] = [
      enrichmentRow('j-1', 'food', 10, TransactionType.DEBIT, AccountType.EXPENSE, 'Food'),
      enrichmentRow('j-1', 'cash', 10, TransactionType.CREDIT, AccountType.ASSET, 'Cash'),
    ];

    const enriched = enrichJournals([journal], rows);
    expect(enriched[0].accounts.map(a => a.id)).toEqual(['cash', 'food']);
  });

  it('keeps each account currency separate from the journal currency', () => {
    const enriched = enrichJournals(
      [journalStub('j-1')],
      [enrichmentRow('j-1', 'cash', 10, TransactionType.CREDIT, AccountType.ASSET, 'Cash', 'EUR')],
    );

    expect(enriched[0].currencyCode).toBe('USD');
    expect(enriched[0].accounts[0]).toMatchObject({ amount: 10, currencyCode: 'EUR' });
  });

  it('preserves posting identity and rates in stable duplicate-account order', () => {
    const base = enrichmentRow(
      'j-1',
      'cash',
      10,
      TransactionType.CREDIT,
      AccountType.ASSET,
      'Cash',
      'EUR',
    );
    const rows = [
      {
        ...base,
        transaction_id: 'z-line' as JournalEnrichmentRow['transaction_id'],
        exchange_rate: 1.2,
      },
      {
        ...base,
        transaction_id: 'a-line' as JournalEnrichmentRow['transaction_id'],
        exchange_rate: 1.3,
      },
    ];
    const forward = enrichJournals([journalStub('j-1')], rows);
    const reverse = enrichJournals([journalStub('j-1')], [...rows].reverse());
    expect(forward[0].accounts.map(leg => leg.transactionId)).toEqual(['a-line', 'z-line']);
    expect(forward[0].accounts.map(leg => leg.exchangeRate)).toEqual([1.3, 1.2]);
    expect(enrichedJournalsAreEqual(forward, reverse)).toBe(true);
    const rateChanged = enrichJournals(
      [journalStub('j-1')],
      rows.map(row => ({ ...row, exchange_rate: 1.5 })),
    );
    expect(enrichedJournalsAreEqual(forward, rateChanged)).toBe(false);
  });

  describe('enrichedJournalsAreEqual', () => {
    it('preserves custom account colors and emits color-only changes, including clearing a color', () => {
      const row = enrichmentRow(
        'j-1',
        'cash',
        10,
        TransactionType.CREDIT,
        AccountType.ASSET,
        'Cash',
      );
      const original = enrichJournals([journalStub('j-1')], [{ ...row, account_color: '#CDAA6B' }]);
      const changed = enrichJournals([journalStub('j-1')], [{ ...row, account_color: '#65C6AD' }]);
      const cleared = enrichJournals([journalStub('j-1')], [{ ...row, account_color: null }]);
      expect(original[0].accounts[0].color).toBe('#CDAA6B');
      expect(changed[0].accounts[0].color).toBe('#65C6AD');
      expect(cleared[0].accounts[0].color).toBeUndefined();
      expect(enrichedJournalsAreEqual(original, changed)).toBe(false);
      expect(enrichedJournalsAreEqual(changed, cleared)).toBe(false);
    });

    it.each([
      {
        label: 'leg amount',
        baseRows: [
          enrichmentRow('j-1', 'cash', 10, TransactionType.CREDIT, AccountType.ASSET, 'Cash'),
          enrichmentRow('j-1', 'food', 10, TransactionType.DEBIT, AccountType.EXPENSE, 'Food'),
        ],
        changedRows: [
          enrichmentRow('j-1', 'cash', 10, TransactionType.CREDIT, AccountType.ASSET, 'Cash'),
          enrichmentRow('j-1', 'food', 15, TransactionType.DEBIT, AccountType.EXPENSE, 'Food'),
        ],
      },
      {
        label: 'account currency',
        baseRows: [
          enrichmentRow('j-1', 'cash', 10, TransactionType.CREDIT, AccountType.ASSET, 'Cash'),
        ],
        changedRows: [
          enrichmentRow(
            'j-1',
            'cash',
            10,
            TransactionType.CREDIT,
            AccountType.ASSET,
            'Cash',
            'EUR',
          ),
        ],
      },
    ])('returns false when $label changes', ({ baseRows, changedRows }) => {
      const base = enrichJournals([journalStub('j-1')], baseRows);
      const updated = enrichJournals([journalStub('j-1')], changedRows);
      expect(enrichedJournalsAreEqual(base, updated)).toBe(false);
    });

    it('returns true when snapshots match', () => {
      const rows = [
        enrichmentRow('j-1', 'cash', 10, TransactionType.CREDIT, AccountType.ASSET, 'Cash'),
        enrichmentRow('j-1', 'food', 10, TransactionType.DEBIT, AccountType.EXPENSE, 'Food'),
      ];
      const a = enrichJournals([journalStub('j-1')], rows);
      const b = enrichJournals([journalStub('j-1')], rows);

      expect(enrichedJournalsAreEqual(a, b)).toBe(true);
    });

    it('returns true when enrichment row order differs but legs are identical', () => {
      const journal = journalStub('j-1');
      const ordered = enrichJournals(
        [journal],
        [
          enrichmentRow('j-1', 'cash', 10, TransactionType.CREDIT, AccountType.ASSET, 'Cash'),
          enrichmentRow('j-1', 'food', 10, TransactionType.DEBIT, AccountType.EXPENSE, 'Food'),
        ],
      );
      const reversedInput = enrichJournals(
        [journal],
        [
          enrichmentRow('j-1', 'food', 10, TransactionType.DEBIT, AccountType.EXPENSE, 'Food'),
          enrichmentRow('j-1', 'cash', 10, TransactionType.CREDIT, AccountType.ASSET, 'Cash'),
        ],
      );

      expect(enrichedJournalsAreEqual(ordered, reversedInput)).toBe(true);
      expect(journalEnrichmentFingerprint(ordered[0])).toBe(
        journalEnrichmentFingerprint(reversedInput[0]),
      );
    });
  });
});
