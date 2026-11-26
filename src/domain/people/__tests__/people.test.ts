import { AccountSubtype, AccountType, TransactionType } from '@/src/types/enums';
import { asAccountId, asJournalId } from '@/src/types/ids';
import {
  buildDirectPersonMovement,
  buildFriendPaidSplit,
  buildPersonShareSummary,
  buildUserPaidSplit,
  classifyPersonDebtPosting,
  customSplit,
  equalSplit,
  evaluateJournalDeleteOrReverseIntegrity,
  evaluateJournalEditIntegrity,
  expectedPersonAccount,
  isCompatiblePersonAccount,
  isEligiblePostedExpense,
  openItemRemainder,
  planAutoSettle,
  planCrossCurrencyRepayment,
  planSameCurrencyRepayment,
  planWeAreSettled,
  projectLinkedAccount,
  summarizePerson,
} from '../index';

const precisionMap = new Map([
  ['INR', 2],
  ['USD', 2],
  ['EUR', 2],
]);

describe('people domain policy & balance projections', () => {
  it('maps the 4-cell money flow and repayment matrix', () => {
    expect(expectedPersonAccount('outflow', true)).toEqual({
      role: 'receivable',
      type: AccountType.ASSET,
      subtype: AccountSubtype.RECEIVABLE,
    });
    expect(expectedPersonAccount('outflow', false)).toEqual({
      role: 'expense',
      type: AccountType.EXPENSE,
      subtype: AccountSubtype.OTHER,
    });
    expect(expectedPersonAccount('inflow', true)).toEqual({
      role: 'payable',
      type: AccountType.LIABILITY,
      subtype: AccountSubtype.PAYABLE,
    });
    expect(expectedPersonAccount('inflow', false)).toEqual({
      role: 'income',
      type: AccountType.INCOME,
      subtype: AccountSubtype.OTHER,
    });
  });

  it('filters institutional liabilities and allows personal LOAN / PAYABLE accounts', () => {
    expect(
      isCompatiblePersonAccount({
        id: asAccountId('cc'),
        type: AccountType.LIABILITY,
        subtype: AccountSubtype.CREDIT_CARD,
        currencyCode: 'INR',
      }),
    ).toBe(false);
    expect(
      isCompatiblePersonAccount({
        id: asAccountId('tax'),
        type: AccountType.LIABILITY,
        subtype: AccountSubtype.TAX_PAYABLE,
        currencyCode: 'INR',
      }),
    ).toBe(false);
    expect(
      isCompatiblePersonAccount({
        id: asAccountId('loan'),
        type: AccountType.LIABILITY,
        subtype: AccountSubtype.LOAN,
        currencyCode: 'INR',
      }),
    ).toBe(true);
    expect(
      isCompatiblePersonAccount({
        id: asAccountId('grp'),
        type: AccountType.ASSET,
        subtype: AccountSubtype.RECEIVABLE,
        currencyCode: 'INR',
        isGroup: true,
      }),
    ).toBe(false);
  });

  it('classifies debt posting direction on receivable and payable accounts', () => {
    expect(
      classifyPersonDebtPosting({
        accountType: AccountType.ASSET,
        transactionType: TransactionType.DEBIT,
      }),
    ).toBe('increasing');
    expect(
      classifyPersonDebtPosting({
        accountType: AccountType.ASSET,
        transactionType: TransactionType.CREDIT,
      }),
    ).toBe('reducing');
    expect(
      classifyPersonDebtPosting({
        accountType: AccountType.LIABILITY,
        transactionType: TransactionType.CREDIT,
      }),
    ).toBe('increasing');
    expect(
      classifyPersonDebtPosting({
        accountType: AccountType.LIABILITY,
        transactionType: TransactionType.DEBIT,
      }),
    ).toBe('reducing');
    expect(
      classifyPersonDebtPosting({
        accountType: AccountType.EXPENSE,
        transactionType: TransactionType.DEBIT,
      }),
    ).toBeNull();
  });

  it('projects tracked remainder, unassigned balance, and negative unassigned warning', () => {
    const accountId = asAccountId('acc-maya-recv');
    const item = {
      id: 'item-1',
      personId: 'maya',
      accountId,
      originatingJournalId: asJournalId('j-1'),
      currencyCode: 'INR',
      originalAmount: 1000,
    };
    const alloc = {
      id: 'alloc-1',
      openItemId: 'item-1',
      journalId: asJournalId('j-2'),
      amount: 200,
      active: true,
    };
    expect(openItemRemainder(item, [alloc])).toBe(800);
    expect(
      projectLinkedAccount({
        accountId,
        currencyCode: 'INR',
        ledgerBalanceInNormalDirection: 700,
        items: [item],
        allocations: [alloc],
      }),
    ).toMatchObject({
      trackedOpenRemainderSum: 800,
      unassignedBalance: -100,
      hasNegativeUnassignedRemainder: true,
    });
  });

  it('summarizes bidirectional balances and informational converted net', () => {
    const recvId = asAccountId('maya-recv');
    const payId = asAccountId('maya-pay');
    const usdRecvId = asAccountId('maya-usd-recv');
    const summary = summarizePerson({
      personId: 'maya',
      accounts: [
        { personId: 'maya', accountId: recvId, role: 'receivable', currencyCode: 'INR' },
        { personId: 'maya', accountId: payId, role: 'payable', currencyCode: 'INR' },
        { personId: 'maya', accountId: usdRecvId, role: 'receivable', currencyCode: 'USD' },
      ],
      items: [],
      allocations: [],
      accountLedgerBalances: new Map([
        [recvId, 1000],
        [payId, 1000],
        [usdRecvId, 10],
      ]),
      convertedCurrency: 'INR',
      quotes: { USD: 80 },
    });
    expect(summary.currencies).toEqual([
      { currencyCode: 'INR', owedToYou: 1000, youOwe: 1000, net: 0 },
      { currencyCode: 'USD', owedToYou: 10, youOwe: 0, net: 10 },
    ]);
    expect(summary.convertedNet).toEqual({
      currencyCode: 'INR',
      amount: 800,
      isInformational: true,
      missingCurrencies: [],
    });
  });
});

describe('split planning', () => {
  it('distributes minor-unit remainder deterministically for 100 / 3 and 9000 / 3', () => {
    expect(equalSplit(100, 3, 'INR')).toEqual([33.34, 33.33, 33.33]);
    expect(equalSplit(9000, 3, 'INR')).toEqual([3000, 3000, 3000]);
    expect(customSplit(100, [40, 35, 25], 'INR')).toEqual([40, 35, 25]);
    expect(() => customSplit(100, [40, 35, 20], 'INR')).toThrow('shares do not equal total');
  });

  it('validates eligible posted expense and builds balanced user-paid & friend-paid splits', () => {
    expect(
      isEligiblePostedExpense(
        [
          { accountType: AccountType.ASSET, currencyCode: 'INR' },
          { accountType: AccountType.EXPENSE, currencyCode: 'INR' },
        ],
        'INR',
      ),
    ).toBe(true);
    expect(
      isEligiblePostedExpense(
        [
          { accountType: AccountType.ASSET, currencyCode: 'USD' },
          { accountType: AccountType.EXPENSE, currencyCode: 'INR' },
        ],
        'INR',
      ),
    ).toBe(false);

    const userSplit = buildUserPaidSplit({
      fundingAccountId: asAccountId('bank'),
      expenseAccountId: asAccountId('travel'),
      participantReceivableIds: [asAccountId('priya-recv'), asAccountId('arun-recv')],
      shares: [3000, 3000, 3000],
      currencyCode: 'INR',
    });
    expect(userSplit).toHaveLength(4);
    expect(userSplit[3]).toMatchObject({
      accountId: asAccountId('bank'),
      amount: 9000,
      transactionType: TransactionType.CREDIT,
    });

    const friendPaid = buildFriendPaidSplit({
      expenseAccountId: asAccountId('travel'),
      personAccountId: asAccountId('priya-payable'),
      userShare: 3000,
      personShare: 3000,
      repayable: true,
      currencyCode: 'INR',
    });
    expect(friendPaid).toEqual([
      {
        accountId: asAccountId('travel'),
        amount: 3000,
        transactionType: TransactionType.DEBIT,
        currencyCode: 'INR',
      },
      {
        accountId: asAccountId('priya-payable'),
        amount: 3000,
        transactionType: TransactionType.CREDIT,
        currencyCode: 'INR',
      },
    ]);

    const giftOut = buildDirectPersonMovement({
      accountId: asAccountId('priya-exp'),
      counterAccountId: asAccountId('bank'),
      amount: 500,
      flow: 'gift_paid',
      currencyCode: 'INR',
    });
    expect(giftOut[0]?.transactionType).toBe(TransactionType.DEBIT);
    expect(giftOut[1]?.transactionType).toBe(TransactionType.CREDIT);
  });
});

describe('settlement, FX, auto-settle, and We are settled', () => {
  it('plans same-currency repayment and rejects negative unassigned or overallocation', () => {
    const targetAcc = asAccountId('priya-recv');
    const item = {
      id: 'oi-1',
      personId: 'priya',
      accountId: targetAcc,
      originatingJournalId: asJournalId('j-1'),
      currencyCode: 'INR',
      originalAmount: 3000,
    };
    const plan = planSameCurrencyRepayment({
      cashAccountId: asAccountId('bank-2'),
      targetAccountId: targetAcc,
      items: [item],
      activeAllocations: [],
      assigned: [{ openItemId: 'oi-1', amount: 1000 }],
      unassignedAmount: 0,
      repaymentLegAmount: 1000,
      currencyCode: 'INR',
      target: {
        accountId: targetAcc,
        currencyCode: 'INR',
        ledgerBalanceInNormalDirection: 3000,
        trackedOpenRemainderSum: 3000,
        unassignedBalance: 0,
        hasNegativeUnassignedRemainder: false,
      },
    });
    expect(plan.allocations).toEqual([{ openItemId: 'oi-1', amount: 1000, kind: 'repayment' }]);
    expect(plan.lines).toHaveLength(2);

    expect(() =>
      planSameCurrencyRepayment({
        cashAccountId: asAccountId('bank-2'),
        targetAccountId: targetAcc,
        items: [item],
        activeAllocations: [],
        assigned: [{ openItemId: 'oi-1', amount: 3500 }],
        unassignedAmount: 0,
        repaymentLegAmount: 3500,
        currencyCode: 'INR',
        target: {
          accountId: targetAcc,
          currencyCode: 'INR',
          ledgerBalanceInNormalDirection: 3000,
          trackedOpenRemainderSum: 3000,
          unassignedBalance: 0,
          hasNegativeUnassignedRemainder: false,
        },
      }),
    ).toThrow('allocation exceeds open remainder');
  });

  it('plans cross-currency repayment using ADR 0007 rate direction', () => {
    const usdRecv = asAccountId('maya-usd-recv');
    const item = {
      id: 'oi-usd',
      personId: 'maya',
      accountId: usdRecv,
      originatingJournalId: asJournalId('j-usd'),
      currencyCode: 'USD',
      originalAmount: 100,
    };
    const plan = planCrossCurrencyRepayment({
      cashAccountId: asAccountId('inr-bank'),
      openItem: item,
      cashAmount: 4000,
      exchangeRate: 80,
      journalCurrency: 'INR',
      precisionByCurrency: precisionMap,
      role: 'receivable',
    });
    expect(plan.allocations).toEqual([{ openItemId: 'oi-usd', amount: 50, kind: 'repayment' }]);
    expect(plan.lines[1]).toMatchObject({
      accountId: usdRecv,
      amount: 50,
      exchangeRate: 80,
      currencyCode: 'USD',
      transactionType: TransactionType.CREDIT,
    });
  });

  it('auto-settles same-currency oldest items first across multiple accounts and unassigned balances', () => {
    const recv1 = asAccountId('r1');
    const recv2 = asAccountId('r2');
    const pay1 = asAccountId('p1');
    const plan = planAutoSettle({
      items: [
        {
          id: 'oi-old',
          personId: 'maya',
          accountId: recv1,
          originatingJournalId: asJournalId('j1'),
          currencyCode: 'INR',
          originalAmount: 600,
          journalDate: 100,
        },
        {
          id: 'oi-new',
          personId: 'maya',
          accountId: recv2,
          originatingJournalId: asJournalId('j2'),
          currencyCode: 'INR',
          originalAmount: 500,
          journalDate: 200,
        },
      ],
      accounts: [
        {
          accountId: recv1,
          currencyCode: 'INR',
          ledgerBalanceInNormalDirection: 600,
          trackedOpenRemainderSum: 600,
          unassignedBalance: 0,
          hasNegativeUnassignedRemainder: false,
        },
        {
          accountId: recv2,
          currencyCode: 'INR',
          ledgerBalanceInNormalDirection: 500,
          trackedOpenRemainderSum: 500,
          unassignedBalance: 0,
          hasNegativeUnassignedRemainder: false,
        },
        {
          accountId: pay1,
          currencyCode: 'INR',
          ledgerBalanceInNormalDirection: 800,
          trackedOpenRemainderSum: 0,
          unassignedBalance: 800,
          hasNegativeUnassignedRemainder: false,
        },
      ],
      roles: new Map([
        [recv1, 'receivable'],
        [recv2, 'receivable'],
        [pay1, 'payable'],
      ]),
      activeAllocations: [],
    });
    expect(plan.allocations).toEqual([
      { openItemId: 'oi-old', amount: 600, kind: 'auto_settle' },
      { openItemId: 'oi-new', amount: 200, kind: 'auto_settle' },
    ]);
    expect(plan.lines).toEqual([
      {
        accountId: recv1,
        amount: 600,
        transactionType: TransactionType.CREDIT,
        currencyCode: 'INR',
      },
      {
        accountId: recv2,
        amount: 200,
        transactionType: TransactionType.CREDIT,
        currencyCode: 'INR',
      },
      {
        accountId: pay1,
        amount: 800,
        transactionType: TransactionType.DEBIT,
        currencyCode: 'INR',
      },
    ]);
  });

  it('plans We are settled in Workplace currency with FX and residual Expense/Income', () => {
    const usdRecv = asAccountId('maya-usd-recv');
    const inrPay = asAccountId('maya-inr-pay');
    const expId = asAccountId('maya-exp');
    const incId = asAccountId('maya-inc');
    const plan = planWeAreSettled({
      accounts: [
        {
          accountId: usdRecv,
          currencyCode: 'USD',
          ledgerBalanceInNormalDirection: 10,
          trackedOpenRemainderSum: 10,
          unassignedBalance: 0,
          hasNegativeUnassignedRemainder: false,
        },
        {
          accountId: inrPay,
          currencyCode: 'INR',
          ledgerBalanceInNormalDirection: 300,
          trackedOpenRemainderSum: 300,
          unassignedBalance: 0,
          hasNegativeUnassignedRemainder: false,
        },
      ],
      items: [
        {
          id: 'oi-usd',
          personId: 'maya',
          accountId: usdRecv,
          originatingJournalId: asJournalId('j-usd'),
          currencyCode: 'USD',
          originalAmount: 10,
        },
        {
          id: 'oi-inr',
          personId: 'maya',
          accountId: inrPay,
          originatingJournalId: asJournalId('j-inr'),
          currencyCode: 'INR',
          originalAmount: 300,
        },
      ],
      activeAllocations: [],
      roles: new Map([
        [usdRecv, 'receivable'],
        [inrPay, 'payable'],
      ]),
      workplaceCurrency: 'INR',
      expenseAccountId: expId,
      incomeAccountId: incId,
      precisionByCurrency: precisionMap,
      exchangeRateByCurrency: new Map([['USD', 80]]),
    });
    // USD 10 * 80 = INR 800 receivable, INR 300 payable -> INR 500 forgiven Expense
    expect(plan.allocations).toEqual([
      { openItemId: 'oi-usd', amount: 10, kind: 'write_off' },
      { openItemId: 'oi-inr', amount: 300, kind: 'write_off' },
    ]);
    expect(plan.lines.find(l => l.accountId === expId)).toMatchObject({
      amount: 500,
      transactionType: TransactionType.DEBIT,
      currencyCode: 'INR',
    });
  });

  it('enforces journal edit/delete/reversal integrity and formats share summary', () => {
    const recvId = asAccountId('priya-recv');
    const j1 = asJournalId('j-origin');
    const j2 = asJournalId('j-settle');
    const items = [
      {
        id: 'oi-1',
        personId: 'priya',
        accountId: recvId,
        originatingJournalId: j1,
        currencyCode: 'INR',
        originalAmount: 3000,
      },
    ];
    const allocations = [
      { id: 'sa-1', openItemId: 'oi-1', journalId: j2, amount: 1000, active: true },
    ];

    // Preserving posting >= allocated allows line replacement edit
    expect(
      evaluateJournalEditIntegrity({
        journalId: j1,
        items,
        allocations,
        beforeLines: [
          {
            originatingJournalId: j1,
            accountId: recvId,
            accountType: AccountType.ASSET,
            transactionType: TransactionType.DEBIT,
            amount: 3000,
          },
        ],
        proposedLines: [
          {
            originatingJournalId: j1,
            accountId: recvId,
            accountType: AccountType.ASSET,
            transactionType: TransactionType.DEBIT,
            amount: 2500,
          },
        ],
      }).allowed,
    ).toBe(true);

    // Reducing below allocated blocks edit
    expect(
      evaluateJournalEditIntegrity({
        journalId: j1,
        items,
        allocations,
        beforeLines: [
          {
            originatingJournalId: j1,
            accountId: recvId,
            accountType: AccountType.ASSET,
            transactionType: TransactionType.DEBIT,
            amount: 3000,
          },
        ],
        proposedLines: [
          {
            originatingJournalId: j1,
            accountId: recvId,
            accountType: AccountType.ASSET,
            transactionType: TransactionType.DEBIT,
            amount: 500,
          },
        ],
      }).allowed,
    ).toBe(false);

    // Deleting/reversing settlement journal deactivates allocations
    const reverseRes = evaluateJournalDeleteOrReverseIntegrity({
      journalId: j2,
      items,
      allocations,
      action: 'reverse',
    });
    expect(reverseRes.allowed).toBe(true);
    expect(reverseRes.allocationsToDeactivate).toEqual(['sa-1']);

    // Share summary output
    const summary = buildPersonShareSummary({
      recipientName: 'Priya',
      date: '2026-11-26',
      items,
      allocations,
      includeRepayments: true,
    });
    expect(summary).toContain('Summary for Priya');
    expect(summary).toContain('INR 2000');
  });
});
