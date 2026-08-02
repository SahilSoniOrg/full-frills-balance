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
    {
      id: 'acc-2',
      name: 'Expenses',
      accountType: 'EXPENSE',
      currencyCode: 'USD',
    },
  ];

  const journalId = 'j-1' as JournalId;
  const accountId = 'acc-1' as AccountId;
  const categoryId = 'acc-2' as AccountId;

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
      accountId: categoryId,
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
  it('accepts structurally valid imports without re-checking journal balance', () => {
    expect(() => validateImportedData(minimalImport())).not.toThrow();
  });

  it('trusts historical amounts and does not soft-delete unbalanced journals', () => {
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

    expect(() => validateImportedData(data)).not.toThrow();
    expect(data.journals[0].deletedAt).toBeUndefined();
    expect(data.transactions[0].deletedAt).toBeUndefined();
  });

  it('rejects transactions that reference a missing account', () => {
    const data = minimalImport({
      transactions: [
        {
          id: 't-1' as TransactionId,
          journalId: 'j-1' as JournalId,
          accountId: 'missing-account' as AccountId,
          amount: 10,
          transactionType: 'DEBIT',
          currencyCode: 'USD',
          transactionDate: Date.now(),
        },
        {
          id: 't-2' as TransactionId,
          journalId: 'j-1' as JournalId,
          accountId: 'acc-1' as AccountId,
          amount: 10,
          transactionType: 'CREDIT',
          currencyCode: 'USD',
          transactionDate: Date.now(),
        },
      ],
    });

    expect(() => validateImportedData(data)).toThrow(/missing account "missing-account"/);
  });

  it('rejects duplicate record ids within an imported table', () => {
    const data = minimalImport({
      transactions: [
        {
          id: 't-1' as TransactionId,
          journalId: 'j-1' as JournalId,
          accountId: 'acc-2' as AccountId,
          amount: 10,
          transactionType: 'DEBIT',
          currencyCode: 'USD',
          transactionDate: Date.now(),
        },
        {
          id: 't-1' as TransactionId,
          journalId: 'j-1' as JournalId,
          accountId: 'acc-1' as AccountId,
          amount: 10,
          transactionType: 'CREDIT',
          currencyCode: 'USD',
          transactionDate: Date.now(),
        },
      ],
    });

    expect(() => validateImportedData(data)).toThrow(/duplicate transaction id "t-1"/);
  });

  it('allows review auto-post rules with an empty category account', () => {
    const data = minimalImport();
    data.transactionAutoPostRules = [
      {
        id: 'rule-review',
        sourceAccountId: 'acc-1' as AccountId,
        categoryAccountId: '' as AccountId,
        isActive: true,
      },
    ];

    expect(() => validateImportedData(data)).not.toThrow();
  });

  it('rejects auto-post rules that reference a real missing account', () => {
    const data = minimalImport();
    data.transactionAutoPostRules = [
      {
        id: 'rule-bad',
        sourceAccountId: 'missing-account' as AccountId,
        categoryAccountId: 'acc-1' as AccountId,
        isActive: true,
      },
    ];

    expect(() => validateImportedData(data)).toThrow(
      /auto-post rule "rule-bad" references missing account "missing-account"/,
    );
  });
});
