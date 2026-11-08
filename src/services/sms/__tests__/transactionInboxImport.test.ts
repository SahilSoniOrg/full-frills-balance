import Account from '@/src/data/models/Account';
import type { AccountId } from '@/src/types/ids';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import {
  prepareTransactionInboxImport,
  type TransactionInboxImportOptions,
} from '@/src/services/sms/transactionInboxImport';
import { asAccountId } from '@/src/types/ids';
import type { SmsAccountRecognition, SmsRecognitionSummary } from '@/src/types/accountMatcher';

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

function prepareNavigation(
  inbox: TransactionInboxItem,
  accounts: Account[],
  options: TransactionInboxImportOptions & {
    recognition?: SmsAccountRecognition | SmsRecognitionSummary;
  } = {},
) {
  const input = options.recognition;
  const recognition: SmsAccountRecognition = input
    ? 'outcomes' in input
      ? input
      : {
          status: input.status,
          accountIds: [...input.accountIds],
          outcomes: [],
          ...(input.flows?.length ? { flows: input.flows } : {}),
        }
    : { status: 'none', accountIds: [], outcomes: [] };
  return prepareTransactionInboxImport(inbox, accounts, { ...options, recognition }).navigation;
}

describe('prepareNavigation', () => {
  it('uses confirmed account recognition to select the account', () => {
    const navigation = prepareNavigation(
      item,
      [account('card', 'Card 1990'), account('savings', 'Savings')],
      {
        recognition: {
          status: 'recognized',
          accountIds: [asAccountId('savings')],
          matcherIds: ['m'],
        },
      },
    );
    expect(navigation.params.sourceAccountId).toBe('savings');
    expect(navigation.params.destinationAccountId).toBeUndefined();
  });
  it('preserves an explicit currency while leaving category selection to manual review', () => {
    const navigation = prepareNavigation({ ...item, parsedCurrencyCode: 'INR' }, [
      account('bank-1', 'Card 1990'),
    ]);
    expect(navigation.params).toMatchObject({
      type: 'expense',
      currencyCode: 'INR',
      amount: '250',
      sourceAccountId: 'bank-1',
    });
    expect(navigation.params.destinationAccountId).toBeUndefined();
  });

  it('preserves the source merchant in the manual entry', () => {
    const navigation = prepareNavigation(item, [
      account('bank-1', 'Card 1990'),
      account('merchant-1', 'Coffee Shop'),
    ]);
    expect(navigation.params).toMatchObject({
      type: 'expense',
      description: 'Coffee Shop',
      notes: '',
      sourceAccountId: 'bank-1',
    });
    expect(navigation.params.destinationAccountId).toBeUndefined();
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
    const navigation = prepareNavigation(inbox, accounts);
    expect(navigation.params).toMatchObject(expected);
  });

  it('passes mode option when provided', () => {
    const navigation = prepareNavigation(item, [account('bank-1', 'Card 1990')], {
      mode: 'split',
    });

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

    const navigation = prepareNavigation(expenseItem, accounts);

    expect(navigation.params.destinationAccountId).not.toBe('inc-interest');
    expect(navigation.params.type).toBe('expense');
  });

  it('prefers a unique recognized account over fuzzy parsed account matching', () => {
    const navigation = prepareNavigation(
      item,
      [account('fuzzy-bank', 'Card 1990'), account('recognized-bank', 'Savings')],
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

  it('uses recognition when text matching cannot identify the account', () => {
    const navigation = prepareNavigation(
      item,
      [account('fuzzy-bank', 'Card 1990'), account('recognized-bank', 'Savings')],
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
    const navigation = prepareNavigation(item, [account('fuzzy-bank', 'Card 1990')], {
      recognition: {
        status: 'recognized',
        accountIds: ['cash', 'savings'] as AccountId[],
        matcherIds: ['matcher-cash', 'matcher-savings'],
      },
    });

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
  ): SmsAccountRecognition => ({
    status: 'recognized',
    accountIds: [...new Set([...flows.map(entry => entry.accountId), ...otherAccounts])],
    outcomes: [],
    flows,
  });

  it.each(['debit', 'credit', 'unknown'] as const)(
    'prefills a declared transfer independently of SMS direction %s',
    direction => {
      const navigation = prepareNavigation({ ...item, direction }, accounts, {
        recognition: recognition([
          { accountId: paying, flow: 'outgoing' },
          { accountId: receiving, flow: 'incoming' },
        ]),
      });
      expect(navigation.params).toMatchObject({
        type: 'transfer',
        sourceAccountId: paying,
        destinationAccountId: receiving,
      });
    },
  );

  it('places a single incoming account on the receiving leg despite a debit SMS', () => {
    const navigation = prepareNavigation(item, accounts, {
      recognition: recognition([{ accountId: receiving, flow: 'incoming' }]),
    });
    expect(navigation.params.type).toBe('income');
    expect(navigation.params.destinationAccountId).toBe(receiving);
    expect(navigation.params.sourceAccountId).toBeUndefined();
  });

  it('leaves an Either account unresolved instead of filling it through fuzzy matching', () => {
    const navigation = prepareNavigation(item, accounts, {
      recognition: recognition([{ accountId: receiving, flow: 'incoming' }], [paying]),
    });
    expect(navigation.params.destinationAccountId).toBe(receiving);
    expect(navigation.params.sourceAccountId).toBeUndefined();
  });

  it('does not complete a partial declared flow', () => {
    const navigation = prepareNavigation(item, accounts, {
      recognition: recognition([{ accountId: receiving, flow: 'incoming' }]),
    });
    expect(navigation.params.type).toBe('income');
    expect(navigation.params.sourceAccountId).toBeUndefined();
    expect(navigation.params.destinationAccountId).toBe(receiving);
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
      const navigation = prepareNavigation(item, accounts, {
        recognition: recognition(flows),
      });
      expect(navigation.params.sourceAccountId).toBeUndefined();
      expect(navigation.params.destinationAccountId).toBeUndefined();
    },
  );

  it('does not prefill a recognized equity account as a financial leg', () => {
    const equity = asAccountId('equity');
    const navigation = prepareNavigation(
      { ...item, parsedMerchant: undefined, parsedAccountSource: undefined },
      [{ ...account(equity, 'Opening balance'), accountType: 'EQUITY' } as Account],
      {
        recognition: {
          status: 'recognized',
          accountIds: [equity],
          matcherIds: ['equity-matcher'],
          flows: [{ accountId: equity, flow: 'incoming' }],
        },
      },
    );
    expect(navigation.params.destinationAccountId).toBeUndefined();
    expect(navigation.params.sourceAccountId).toBeUndefined();
    expect(navigation.params.type).toBe('expense');
  });

  it('does not hide an unresolved third candidate behind a declared transfer pair', () => {
    const navigation = prepareNavigation(item, accounts, {
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
