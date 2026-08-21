import Account from '@/src/data/models/Account';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { TransactionInboxItem } from '@/src/types/domain';
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
      notes: 'Coffee Shop 250 REF-1 HDFCBK',
      sourceAccountId: 'bank-1',
      destinationAccountId: 'merchant-1',
    });
    expect(navigation.smsId).toBe('sms-1');
    expect(navigation.smsRecordId).toBe('inbox-1');
  });

  it('falls back to account heuristics and preserves income direction', () => {
    const navigation = buildTransactionInboxImportNavigation(
      { ...item, direction: 'credit', parsedAccountSource: 'Salary', parsedMerchant: 'Acme' },
      [account('salary', 'Salary', 'Salary account')],
      null,
    );

    expect(navigation.params.type).toBe('income');
    expect(navigation.params.destinationAccountId).toBe('salary');
    expect(navigation.params.notes).toContain('Imported from SMS');
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
