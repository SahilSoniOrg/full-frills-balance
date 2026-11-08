import { AccountId, JournalId, TransactionId } from '@/src/types/ids';
import { JournalDisplayType } from '@/src/types/enums';
import {
  BatchImportData,
  CanonicalAccount,
  CanonicalJournal,
  CanonicalTransaction,
} from '@/src/types/importContracts';
import { validateImportedData } from '@/src/services/import/validateImportedData';
import { conditionsKeyFor } from '@/src/services/sms/recognition/accountMatcherDefinition';

function minimalImport(overrides?: {
  journals?: CanonicalJournal[];
  transactions?: CanonicalTransaction[];
}): BatchImportData {
  const accounts: CanonicalAccount[] = [
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

  const journals: CanonicalJournal[] = overrides?.journals ?? [
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

  const transactions: CanonicalTransaction[] = overrides?.transactions ?? [
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
  it('accepts structurally valid, balanced imports', () => {
    expect(() => validateImportedData(minimalImport())).not.toThrow();
  });

  it('trusts historically unbalanced journals during restore', () => {
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

  it('trusts historical FX amounts during restore', () => {
    const data = minimalImport({
      transactions: [
        {
          id: 't-1' as TransactionId,
          journalId: 'j-1' as JournalId,
          accountId: 'acc-2' as AccountId,
          amount: 150,
          transactionType: 'DEBIT',
          currencyCode: 'USD',
          transactionDate: Date.now(),
        },
        {
          id: 't-2' as TransactionId,
          journalId: 'j-1' as JournalId,
          accountId: 'acc-1' as AccountId,
          amount: 100,
          transactionType: 'CREDIT',
          currencyCode: 'EUR',
          exchangeRate: 1 / 1.5,
          transactionDate: Date.now(),
        },
      ],
    });
    data.accounts[1] = { ...data.accounts[1], currencyCode: 'EUR' };

    expect(() => validateImportedData(data)).not.toThrow();
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

  it('rejects budgets that reference a missing asset account id', () => {
    const data = minimalImport();
    data.budgets = [
      {
        id: 'budget-1',
        name: 'Food',
        amount: 100,
        currencyCode: 'USD',
        startMonth: '2024-01',
        active: true,
        assetAccountIds: 'acc-1,missing-asset',
      },
    ];

    expect(() => validateImportedData(data)).toThrow(
      /budget "budget-1" references missing asset account "missing-asset"/,
    );
  });

  it('validates imported matcher definitions and their owner references', () => {
    const definition = { version: 1 as const, sender: { op: 'contains' as const, value: 'BANK' } };
    const data = minimalImport();
    data.accountMatchers = [
      {
        id: 'matcher-1',
        accountId: 'acc-1' as AccountId,
        definitionJson: JSON.stringify(definition),
        conditionsKey: conditionsKeyFor(definition),
        isEnabled: true,
        provenance: 'manual',
      },
    ];
    expect(() => validateImportedData(data)).not.toThrow();

    data.accountMatchers[0].definitionJson = '{invalid';
    expect(() => validateImportedData(data)).toThrow(
      /account matcher "matcher-1" has invalid definition/,
    );

    data.accountMatchers[0].definitionJson = JSON.stringify(definition);
    data.accountMatchers[0].accountId = 'missing-owner' as AccountId;
    expect(() => validateImportedData(data)).toThrow(/missing account "missing-owner"/);
  });
});
