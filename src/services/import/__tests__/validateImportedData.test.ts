import { AccountId, JournalDisplayType, JournalId, TransactionId } from '@/src/types/domain';
import {
  BatchImportData,
  ImportedAccount,
  ImportedJournal,
  ImportedTransaction,
} from '@/src/data/repositories/ImportRepository';
import { validateImportedData } from '@/src/services/import/validateImportedData';

function minimalImport(overrides?: {
  journals?: ImportedJournal[];
  transactions?: ImportedTransaction[];
}): BatchImportData {
  const accounts: ImportedAccount[] = [
    {
      id: 'acc-1',
      name: 'Cash',
      accountType: 'ASSET',
      currencyCode: 'USD',
    },
  ];

  const journalId = 'j-1' as JournalId;
  const accountId = 'acc-1' as AccountId;

  const journals: ImportedJournal[] = overrides?.journals ?? [
    {
      id: journalId,
      journalDate: Date.now(),
      description: 'Coffee',
      currencyCode: 'USD',
      status: 'POSTED',
      totalAmount: 10,
      transactionCount: 2,
      displayType: 'EXPENSE' as JournalDisplayType,
    },
  ];

  const transactions: ImportedTransaction[] = overrides?.transactions ?? [
    {
      id: 't-1' as TransactionId,
      journalId,
      accountId,
      amount: 10,
      transactionType: 'DEBIT',
      currencyCode: 'USD',
      transactionDate: Date.now(),
    },
    {
      id: 't-2' as TransactionId,
      journalId,
      accountId,
      amount: 10,
      transactionType: 'CREDIT',
      currencyCode: 'USD',
      transactionDate: Date.now(),
    },
  ];

  return { accounts, journals, transactions };
}

describe('validateImportedData', () => {
  it('accepts balanced journals', () => {
    expect(() => validateImportedData(minimalImport())).not.toThrow();
  });

  it('rejects unbalanced journals with journal id and imbalance', () => {
    const data = minimalImport({
      transactions: [
        {
          id: 't-1' as TransactionId,
          journalId: 'j-1' as JournalId,
          accountId: 'acc-1' as AccountId,
          amount: 10,
          transactionType: 'DEBIT',
          currencyCode: 'USD',
          transactionDate: Date.now(),
        },
      ],
    });

    expect(() => validateImportedData(data)).toThrow(
      /Import validation failed: journal "Coffee" \(j-1\) is unbalanced.*imbalance: 10/,
    );
  });

  it('uses journal id in message when description is missing', () => {
    const data = minimalImport({
      journals: [
        {
          id: 'j-only-id' as JournalId,
          journalDate: Date.now(),
          currencyCode: 'USD',
          status: 'POSTED',
          totalAmount: 5,
          transactionCount: 1,
          displayType: 'EXPENSE' as JournalDisplayType,
        },
      ],
      transactions: [
        {
          id: 't-1' as TransactionId,
          journalId: 'j-only-id' as JournalId,
          accountId: 'acc-1' as AccountId,
          amount: 5,
          transactionType: 'DEBIT',
          currencyCode: 'USD',
          transactionDate: Date.now(),
        },
      ],
    });

    expect(() => validateImportedData(data)).toThrow(/journal "j-only-id" \(j-only-id\)/);
  });
});
