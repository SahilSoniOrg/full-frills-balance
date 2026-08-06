import { SimulationReportGenerator } from '@/src/services/simulation/SimulationReportGenerator';
import { Flow, FlowCategory, FlowSource } from '@/src/services/simulation/types';
import Account from '@/src/data/models/Account';
import { AccountId, AccountSubtype, AccountType } from '@/src/types/domain';

describe('SimulationReportGenerator', () => {
  const resultCurrency = 'USD';

  // Mock account
  const mockAccount = (id: AccountId, name: string, subtype: AccountSubtype): Account =>
    ({
      id,
      name,
      accountSubtype: subtype,
      accountType: subtype === 'CREDIT_CARD' ? AccountType.LIABILITY : AccountType.ASSET,
      currencyCode: resultCurrency,
    }) as Account;

  const accountMap = new Map<AccountId, Account>([
    [
      'checking' as AccountId,
      mockAccount('checking' as AccountId, 'Checking', AccountSubtype.BANK_CHECKING),
    ],
    ['cc' as AccountId, mockAccount('cc' as AccountId, 'Credit Card', AccountSubtype.CREDIT_CARD)],
  ]);

  const liquidAccountIdsSet = new Set<AccountId>(['checking' as AccountId]);

  it('correctly calculates summary totals', () => {
    const flows: Flow[] = [
      {
        kind: 'INFLOW',
        accountId: 'checking' as AccountId,
        amount: 2000,
        dayOffset: 5,
        category: FlowCategory.INCOME,
        timeframe: 'FUTURE',
        label: 'Salary',
        origin: FlowSource.PLANNED_PAYMENT,
        referenceId: 'salary-1',
      },
      {
        kind: 'OUTFLOW',
        accountId: 'checking' as AccountId,
        amount: 100,
        dayOffset: 10,
        category: FlowCategory.PLANNED_EXPENSE,
        timeframe: 'FUTURE',
        label: 'Internet',
        origin: FlowSource.PLANNED_PAYMENT,
        referenceId: 'internet-1',
      },
      {
        kind: 'OUTFLOW',
        accountId: 'checking' as AccountId,
        amount: 50,
        dayOffset: 2,
        category: FlowCategory.BUDGET,
        timeframe: 'FUTURE',
        label: 'Groceries',
        origin: FlowSource.BUDGET,
        categoryId: 'exp-groceries',
        referenceId: 'b-groceries',
      },
    ];

    const report = SimulationReportGenerator.generate(flows, accountMap, [], liquidAccountIdsSet);

    expect(report.summary.totalFutureInflow).toBe(2000);
    expect(report.summary.totalPlannedInflow).toBe(2000);
    expect(report.summary.totalPlannedOutflow).toBe(100);
    expect(report.summary.totalCommittedPlanned).toBe(150);
  });

  it('prevents double-counting liabilities in committed section', () => {
    // A liability flow should go to 'debt', not 'committed'
    const flows: Flow[] = [
      {
        kind: 'OUTFLOW',
        accountId: 'cc' as AccountId,
        amount: 300,
        dayOffset: 20,
        category: FlowCategory.DEBT,
        timeframe: 'FUTURE',
        label: 'CC Payment',
        origin: FlowSource.LIABILITY,
        referenceId: 'cc',
      },
    ];

    const report = SimulationReportGenerator.generate(
      flows,
      accountMap,
      [{ account: accountMap.get('cc' as AccountId)!, balance: 500 }],
      liquidAccountIdsSet,
    );

    expect(report.allFlows).toHaveLength(1);
    expect(report.liabilities.total).toBe(500);
    expect(report.liabilities.committed).toBe(300);
  });

  it('handles transfer symmetry: external-to-liquid counts as inflow', () => {
    const flows: Flow[] = [
      {
        kind: 'TRANSFER',
        fromAccountId: 'external-employer' as AccountId,
        toAccountId: 'checking' as AccountId,
        amount: 3000,
        dayOffset: 5,
        category: FlowCategory.INCOME,
        timeframe: 'FUTURE',
        label: 'External Transfer Income',
        origin: FlowSource.PLANNED_PAYMENT,
        referenceId: 'ext-inc-1',
      },
      {
        kind: 'TRANSFER',
        fromAccountId: 'checking' as AccountId,
        toAccountId: 'savings' as AccountId, // Internal move (if both liquid)
        amount: 500,
        dayOffset: 10,
        category: FlowCategory.TRANSFER,
        timeframe: 'FUTURE',
        label: 'Internal Move',
        origin: FlowSource.PLANNED_PAYMENT,
        referenceId: 'int-move-1',
      },
    ];

    const liquidAccountIdsWithSavings = new Set<AccountId>([
      'checking' as AccountId,
      'savings' as AccountId,
    ]);

    const report = SimulationReportGenerator.generate(
      flows,
      accountMap,
      [],
      liquidAccountIdsWithSavings,
    );

    // External-to-Liquid = INFLOW
    expect(report.summary.totalFutureInflow).toBe(3000);
    // Liquid-to-Liquid = INTERNAL (Net zero for summary)
    expect(report.summary.totalPlannedOutflow).toBe(0);
  });

  it('handles commitment semantics: manual transfer is NOT commitment', () => {
    const flows: Flow[] = [
      {
        kind: 'TRANSFER',
        fromAccountId: 'checking' as AccountId,
        toAccountId: 'savings' as AccountId,
        amount: 500,
        dayOffset: 10,
        category: FlowCategory.TRANSFER,
        timeframe: 'FUTURE',
        label: 'Rebalancing',
        origin: FlowSource.MANUAL, // Manual move
        referenceId: 'reb-1',
      },
      {
        kind: 'TRANSFER',
        fromAccountId: 'checking' as AccountId,
        toAccountId: 'goal-fund' as AccountId,
        amount: 200,
        dayOffset: 15,
        category: FlowCategory.TRANSFER,
        timeframe: 'FUTURE',
        label: 'Planned SIP',
        origin: FlowSource.PLANNED_PAYMENT, // Obligation
        referenceId: 'sip-1',
      },
    ];

    const liquidAccountIds = new Set<AccountId>([
      'checking' as AccountId,
      'savings' as AccountId,
      'goal-fund' as AccountId,
    ]);
    const report = SimulationReportGenerator.generate(flows, accountMap, [], liquidAccountIds);

    // Only the SIP (PLANNED_PAYMENT) should be a commitment.
    // The Manual Rebalancing should be ignored.
    expect(report.summary.totalCommittedPlanned).toBe(200);
  });
});
