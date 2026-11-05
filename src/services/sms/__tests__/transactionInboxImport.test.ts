import Account from '@/src/data/models/Account';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import type { AccountId } from '@/src/types/ids';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { buildTransactionInboxImportNavigation } from '@/src/services/sms/transactionInboxImport';
import { EMPTY_ACCOUNT_ID, asAccountId } from '@/src/types/ids';
import type { SmsRecognitionSummary } from '@/src/types/accountMatcher';

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
  it('leaves both accounts unset when a rule conflicts with recognition', () => {
    const navigation = buildTransactionInboxImportNavigation(
      item,
      [account('card', 'Card 1990'), account('savings', 'Savings')],
      { sourceAccountId: 'card', categoryAccountId: 'food' } as TransactionAutoPostRule,
      {
        recognition: {
          status: 'recognized',
          accountIds: [asAccountId('savings')],
          matcherIds: ['m'],
          hold: 'contradictory',
        },
      },
    );
    expect(navigation.params.sourceAccountId).toBeUndefined();
    expect(navigation.params.destinationAccountId).toBeUndefined();
  });
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

  it('prefers a unique recognized account over fuzzy parsed account matching', () => {
    const navigation = buildTransactionInboxImportNavigation(
      item,
      [account('fuzzy-bank', 'Card 1990'), account('recognized-bank', 'Savings')],
      null,
      {
        recognition: {
          status: 'recognized',
          accountIds: ['recognized-bank' as AccountId],
          matcherIds: ['matcher-1'],
        },
      },
    );

    expect(navigation.params.sourceAccountId).toBe('recognized-bank');
  });

  it('uses recognition when the matched rule leaves its source account empty', () => {
    const navigation = buildTransactionInboxImportNavigation(
      item,
      [account('fuzzy-bank', 'Card 1990'), account('recognized-bank', 'Savings')],
      {
        sourceAccountId: EMPTY_ACCOUNT_ID,
        categoryAccountId: EMPTY_ACCOUNT_ID,
      } as TransactionAutoPostRule,
      {
        recognition: {
          status: 'recognized',
          accountIds: ['recognized-bank' as AccountId],
          matcherIds: ['matcher-1'],
        },
      },
    );

    expect(navigation.params.sourceAccountId).toBe('recognized-bank');
  });

  it('does not preselect a fuzzy account when multiple accounts are recognized', () => {
    const navigation = buildTransactionInboxImportNavigation(
      item,
      [account('fuzzy-bank', 'Card 1990')],
      null,
      {
        recognition: {
          status: 'recognized',
          accountIds: ['cash', 'savings'] as AccountId[],
          matcherIds: ['matcher-cash', 'matcher-savings'],
        },
      },
    );

    expect(navigation.params.sourceAccountId).toBeUndefined();
  });
});

describe('declared account flows on manual SMS import', () => {
  const paying = asAccountId('paying-account');
  const receiving = asAccountId('receiving-account');
  const extra = asAccountId('extra-account');
  const accounts = [
    account(paying, 'Card 1990'),
    account(receiving, 'Savings'),
    account(extra, 'Other account'),
    { ...account('coffee', 'Coffee Shop'), accountType: 'EXPENSE' } as Account,
  ];
  const recognition = (
    flows: NonNullable<SmsRecognitionSummary['flows']>,
    otherAccounts: AccountId[] = [],
  ): SmsRecognitionSummary => ({
    status: 'recognized',
    accountIds: [...new Set([...flows.map(entry => entry.accountId), ...otherAccounts])],
    matcherIds: ['flow-matcher'],
    flows,
  });

  it.each(['debit', 'credit', 'unknown'] as const)(
    'prefills a declared transfer independently of SMS direction %s',
    direction => {
      const navigation = buildTransactionInboxImportNavigation(
        { ...item, direction },
        accounts,
        null,
        {
          recognition: recognition([
            { accountId: paying, flow: 'outgoing' },
            { accountId: receiving, flow: 'incoming' },
          ]),
        },
      );
      expect(navigation.params).toMatchObject({
        type: 'transfer',
        sourceAccountId: paying,
        destinationAccountId: receiving,
      });
    },
  );

  it('places a single incoming account on the receiving leg despite a debit SMS', () => {
    const navigation = buildTransactionInboxImportNavigation(item, accounts, null, {
      recognition: recognition([{ accountId: receiving, flow: 'incoming' }]),
    });
    expect(navigation.params.type).toBe('income');
    expect(navigation.params.destinationAccountId).toBe(receiving);
    expect(navigation.params.sourceAccountId).toBeUndefined();
  });

  it('leaves an Either account unresolved instead of filling it through fuzzy matching', () => {
    const navigation = buildTransactionInboxImportNavigation(item, accounts, null, {
      recognition: recognition([{ accountId: receiving, flow: 'incoming' }], [paying]),
    });
    expect(navigation.params.destinationAccountId).toBe(receiving);
    expect(navigation.params.sourceAccountId).toBeUndefined();
  });

  it('keeps a compatible rule pair on the legs a declared flow confirms', () => {
    const navigation = buildTransactionInboxImportNavigation(
      item,
      accounts,
      { sourceAccountId: paying, categoryAccountId: receiving } as TransactionAutoPostRule,
      { recognition: recognition([{ accountId: receiving, flow: 'incoming' }]) },
    );
    expect(navigation.params).toMatchObject({
      type: 'transfer',
      sourceAccountId: paying,
      destinationAccountId: receiving,
    });
  });

  it('does not fill a declared account the rule does not name', () => {
    const navigation = buildTransactionInboxImportNavigation(
      item,
      accounts,
      { sourceAccountId: paying, categoryAccountId: EMPTY_ACCOUNT_ID } as TransactionAutoPostRule,
      { recognition: recognition([{ accountId: receiving, flow: 'incoming' }]) },
    );
    expect(navigation.params.sourceAccountId).toBeUndefined();
    expect(navigation.params.destinationAccountId).toBeUndefined();
  });

  it('does not choose between a rule and a contradictory declared account role', () => {
    const navigation = buildTransactionInboxImportNavigation(
      item,
      accounts,
      { sourceAccountId: receiving, categoryAccountId: paying } as TransactionAutoPostRule,
      { recognition: recognition([{ accountId: receiving, flow: 'incoming' }]) },
    );
    expect(navigation.params.sourceAccountId).toBeUndefined();
    expect(navigation.params.destinationAccountId).toBeUndefined();
  });

  it('does not orient a configured rule pair when SMS direction is unknown', () => {
    const navigation = buildTransactionInboxImportNavigation(
      { ...item, direction: 'unknown' },
      accounts,
      { sourceAccountId: paying, categoryAccountId: receiving } as TransactionAutoPostRule,
      { recognition: recognition([{ accountId: receiving, flow: 'incoming' }]) },
    );
    expect(navigation.params.sourceAccountId).toBeUndefined();
    expect(navigation.params.destinationAccountId).toBeUndefined();
  });

  it('does not hide an Either candidate that contradicts the configured rule pair', () => {
    const navigation = buildTransactionInboxImportNavigation(
      item,
      accounts,
      { sourceAccountId: extra, categoryAccountId: receiving } as TransactionAutoPostRule,
      { recognition: recognition([{ accountId: receiving, flow: 'incoming' }], [paying]) },
    );
    expect(navigation.params.sourceAccountId).toBeUndefined();
    expect(navigation.params.destinationAccountId).toBeUndefined();
  });

  it.each([
    [
      { accountId: paying, flow: 'incoming' },
      { accountId: paying, flow: 'outgoing' },
    ],
    [
      { accountId: paying, flow: 'outgoing' },
      { accountId: receiving, flow: 'outgoing' },
    ],
  ] satisfies NonNullable<SmsRecognitionSummary['flows']>[])(
    'leaves conflicting flow declarations for manual resolution',
    (...flows) => {
      const navigation = buildTransactionInboxImportNavigation(item, accounts, null, {
        recognition: recognition(flows),
      });
      expect(navigation.params.sourceAccountId).toBeUndefined();
      expect(navigation.params.destinationAccountId).toBeUndefined();
    },
  );

  it('does not treat a recognized equity account as a confirmed financial leg', () => {
    const equity = asAccountId('equity');
    const navigation = buildTransactionInboxImportNavigation(
      { ...item, parsedMerchant: undefined, parsedAccountSource: undefined },
      [{ ...account(equity, 'Opening balance'), accountType: 'EQUITY' } as Account],
      null,
      {
        recognition: {
          status: 'recognized',
          accountIds: [equity],
          matcherIds: ['equity-matcher'],
          flows: [{ accountId: equity, flow: 'incoming' }],
        },
      },
    );
    expect(navigation.params.destinationAccountId).toBe(equity);
    expect(navigation.params.sourceAccountId).toBeUndefined();
    expect(navigation.params.type).toBe('expense');
  });

  it('does not confirm a transfer when equity is the only recognized account', () => {
    const equity = asAccountId('equity');
    const bank = asAccountId('bank');
    const navigation = buildTransactionInboxImportNavigation(
      item,
      [
        account(bank, 'Bank'),
        { ...account(equity, 'Opening balance'), accountType: 'EQUITY' } as Account,
      ],
      { sourceAccountId: bank, categoryAccountId: equity } as TransactionAutoPostRule,
      {
        recognition: {
          status: 'recognized',
          accountIds: [equity],
          matcherIds: ['equity-matcher'],
          flows: [{ accountId: equity, flow: 'incoming' }],
        },
      },
    );
    expect(navigation.params.sourceAccountId).toBeUndefined();
    expect(navigation.params.destinationAccountId).toBeUndefined();
    expect(navigation.params.type).not.toBe('transfer');
  });

  it('does not hide an unresolved third candidate behind a declared transfer pair', () => {
    const navigation = buildTransactionInboxImportNavigation(item, accounts, null, {
      recognition: recognition(
        [
          { accountId: paying, flow: 'outgoing' },
          { accountId: receiving, flow: 'incoming' },
        ],
        [extra],
      ),
    });
    expect(navigation.params.sourceAccountId).toBeUndefined();
    expect(navigation.params.destinationAccountId).toBeUndefined();
  });
});
