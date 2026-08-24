import type { JournalEnrichmentRow } from '@/src/data/repositories/journal/journalEnrichmentTypes';
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
): JournalEnrichmentRow {
  return {
    journal_id: journalId as JournalEnrichmentRow['journal_id'],
    account_id: accountId as JournalEnrichmentRow['account_id'],
    amount,
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
});

describe('enrichedJournalsAreEqual', () => {
  it('returns false when a leg amount changes', () => {
    const base = enrichJournals(
      [journalStub('j-1')],
      [
        enrichmentRow('j-1', 'cash', 10, TransactionType.CREDIT, AccountType.ASSET, 'Cash'),
        enrichmentRow('j-1', 'food', 10, TransactionType.DEBIT, AccountType.EXPENSE, 'Food'),
      ],
    );
    const updated = enrichJournals(
      [journalStub('j-1')],
      [
        enrichmentRow('j-1', 'cash', 10, TransactionType.CREDIT, AccountType.ASSET, 'Cash'),
        enrichmentRow('j-1', 'food', 15, TransactionType.DEBIT, AccountType.EXPENSE, 'Food'),
      ],
    );

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
