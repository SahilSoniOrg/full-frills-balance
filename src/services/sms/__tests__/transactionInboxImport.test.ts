import Account from '@/src/data/models/Account';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { buildTransactionInboxImportNavigation } from '@/src/services/sms/transactionInboxImport';

const item: TransactionInboxItem = {
  id: 'inbox-1',
  channel: 'sms',
  deviceSourceId: 'sms-1',
  senderAddress: 'HDFCBK',
  rawBody: 'Card payment at Coffee Shop',
  inputDate: 1_700_000_000_000,
  parseStatus: 'parsed',
  processingStatus: 'pending',
  parsedAmount: 250,
  parsedMerchant: 'Coffee Shop',
  parsedAccountSource: 'Card 1990',
  referenceNumber: 'REF-1',
  direction: 'debit',
};

const account = (id: string, name: string, description?: string) =>
  ({ id, name, description, accountType: 'ASSET', currencyCode: 'INR' }) as Account;

describe('buildTransactionInboxImportNavigation', () => {
  it.each([
    {
      label: 'mapped expense category',
      inbox: { ...item, parsedCurrencyCode: 'INR' as const },
      accounts: [
        account('bank-1', 'Card 1990'),
        { ...account('food', 'Coffee Shop'), accountType: 'EXPENSE' } as Account,
      ],
      rule: { sourceAccountId: 'bank-1', categoryAccountId: 'food' } as TransactionAutoPostRule,
      expected: {
        type: 'expense',
        currencyCode: 'INR',
        amount: '250',
        sourceAccountId: 'bank-1',
        destinationAccountId: 'food',
      },
    },
    {
      label: 'mapped income category',
      inbox: { ...item, direction: 'credit' as const },
      accounts: [
        account('bank-1', 'Card 1990'),
        { ...account('salary', 'Salary'), accountType: 'INCOME' } as Account,
      ],
      rule: { sourceAccountId: 'bank-1', categoryAccountId: 'salary' } as TransactionAutoPostRule,
      expected: {
        type: 'income',
        sourceAccountId: 'salary',
        destinationAccountId: 'bank-1',
      },
    },
  ])(
    'preserves currency and treats a $label as the journal type',
    ({ inbox, accounts, rule, expected }) => {
      expect(buildTransactionInboxImportNavigation(inbox, accounts, rule).params).toMatchObject(
        expected,
      );
    },
  );

  it('uses rule mappings and expands description placeholders', () => {
    const navigation = buildTransactionInboxImportNavigation(
      item,
      [account('bank-1', 'Card 1990'), account('merchant-1', 'Coffee Shop')],
      {
        sourceAccountId: 'bank-1',
        categoryAccountId: 'merchant-1',
        actionsJson: JSON.stringify({
          journalDescription: '{merchant} {amount} {ref} {sender}',
        }),
      } as TransactionAutoPostRule,
    );

    expect(navigation.params).toEqual({
      type: 'transfer',
      amount: '250',
      description: 'Coffee Shop 250 REF-1 HDFCBK',
      notes: '',
      sourceAccountId: 'bank-1',
      destinationAccountId: 'merchant-1',
    });
    expect(navigation.smsId).toBe('sms-1');
    expect(navigation.smsRecordId).toBe('inbox-1');
    expect(JSON.stringify(navigation)).not.toContain(item.rawBody);
  });

  it.each([
    {
      label: 'heuristic income direction',
      inbox: {
        ...item,
        direction: 'credit' as const,
        parsedAccountSource: 'Salary',
        parsedMerchant: 'Acme',
      },
      accounts: [account('salary', 'Salary', 'Salary account')],
      expected: {
        type: 'income',
        description: 'Acme',
        destinationAccountId: 'salary',
        notes: '',
      },
    },
    {
      label: 'empty notes on SMS import',
      inbox: item,
      accounts: [] as Account[],
      expected: { description: 'Coffee Shop', notes: '' },
    },
    {
      label: 'automatic description fallback without merchant',
      inbox: { ...item, parsedMerchant: undefined, senderAddress: 'PrivateBankSender' },
      accounts: [] as Account[],
      expected: { description: 'Expense via SMS', notes: '' },
    },
  ])('falls back for $label', ({ inbox, accounts, expected }) => {
    const navigation = buildTransactionInboxImportNavigation(inbox, accounts, null);
    expect(navigation.params).toMatchObject(expected);
  });

  it('passes mode option when provided', () => {
    const navigation = buildTransactionInboxImportNavigation(
      item,
      [account('bank-1', 'Card 1990')],
      null,
      { mode: 'split' },
    );

    expect(navigation.params.mode).toBe('split');
  });

  it('does not bind an expense debit to an income account counterparty', () => {
    const expenseItem: TransactionInboxItem = {
      ...item,
      direction: 'debit',
      parsedAccountSource: 'Card 1990',
      parsedMerchant: 'Interest',
    };

    const accounts = [
      account('bank-1', 'Card 1990'),
      {
        id: 'inc-interest',
        name: 'Interest',
        accountType: 'INCOME',
        currencyCode: 'INR',
      } as Account,
      {
        id: 'exp-general',
        name: 'General',
        accountType: 'EXPENSE',
        currencyCode: 'INR',
      } as Account,
    ];

    const navigation = buildTransactionInboxImportNavigation(expenseItem, accounts, null);

    expect(navigation.params.destinationAccountId).not.toBe('inc-interest');
    expect(navigation.params.type).toBe('expense');
  });
});
