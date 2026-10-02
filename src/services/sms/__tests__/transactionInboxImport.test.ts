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
  it('preserves captured currency and treats a mapped expense category as an expense', () => {
    const navigation = buildTransactionInboxImportNavigation(
      { ...item, parsedCurrencyCode: 'INR' },
      [
        account('bank-1', 'Card 1990'),
        { ...account('food', 'Coffee Shop'), accountType: 'EXPENSE' } as Account,
      ],
      { sourceAccountId: 'bank-1', categoryAccountId: 'food' } as TransactionAutoPostRule,
    );
    expect(navigation.params).toMatchObject({
      type: 'expense',
      currencyCode: 'INR',
      amount: '250',
      sourceAccountId: 'bank-1',
      destinationAccountId: 'food',
    });
  });

  it('treats a mapped income category as income', () => {
    const navigation = buildTransactionInboxImportNavigation(
      { ...item, direction: 'credit' },
      [
        account('bank-1', 'Card 1990'),
        { ...account('salary', 'Salary'), accountType: 'INCOME' } as Account,
      ],
      { sourceAccountId: 'bank-1', categoryAccountId: 'salary' } as TransactionAutoPostRule,
    );
    expect(navigation.params).toMatchObject({
      type: 'income',
      sourceAccountId: 'salary',
      destinationAccountId: 'bank-1',
    });
  });
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

  it('falls back to account heuristics and preserves income direction', () => {
    const navigation = buildTransactionInboxImportNavigation(
      { ...item, direction: 'credit', parsedAccountSource: 'Salary', parsedMerchant: 'Acme' },
      [account('salary', 'Salary', 'Salary account')],
      null,
    );

    expect(navigation.params.type).toBe('income');
    expect(navigation.params.description).toBe('Acme');
    expect(navigation.params.destinationAccountId).toBe('salary');
    expect(navigation.params.notes).toBe('');
  });

  it('leaves notes empty on SMS import', () => {
    const navigation = buildTransactionInboxImportNavigation(item, [], null);

    expect(navigation.params.description).toBe('Coffee Shop');
    expect(navigation.params.notes).toBe('');
  });

  it('does not copy an unparsed SMS sender into the automatic description fallback', () => {
    const navigation = buildTransactionInboxImportNavigation(
      { ...item, parsedMerchant: undefined, senderAddress: 'PrivateBankSender' },
      [],
      null,
    );
    expect(navigation.params.description).toBe('Expense via SMS');
    expect(navigation.params.notes).toBe('');
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

    // Counterparty must NOT be the income account 'inc-interest'
    expect(navigation.params.destinationAccountId).not.toBe('inc-interest');
    expect(navigation.params.type).toBe('expense');
  });
});
