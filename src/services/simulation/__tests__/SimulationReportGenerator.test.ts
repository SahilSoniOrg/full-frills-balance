import { SimulationReportGenerator } from '@/src/services/simulation/SimulationReportGenerator';
import { Flow, SimulationEngineResult } from '@/src/services/simulation/types';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';

describe('SimulationReportGenerator', () => {
  const resultCurrency = 'USD';

  // Mock account
  const mockAccount = (id: string, name: string, subtype: AccountSubtype): Account =>
    ({
      id,
      name,
      accountSubtype: subtype,
      accountType: subtype === 'CREDIT_CARD' ? AccountType.LIABILITY : AccountType.ASSET,
      currencyCode: resultCurrency,
    }) as Account;

  const accountMap = new Map<string, Account>([
    ['checking', mockAccount('checking', 'Checking', AccountSubtype.BANK_CHECKING)],
    ['cc', mockAccount('cc', 'Credit Card', AccountSubtype.CREDIT_CARD)],
  ]);

  const mockSimulationResult: SimulationEngineResult = {
    summary: {
      safeToSpend: 1000,
      shortfall: 0,
      trajectoryMinBalance: 500,
      accountMinBalances: new Map(),
      accountMinBalancesBeforeIncome: new Map(),
      firstMajorInflowDay: 15,
    },
    accountSummaries: [],
    projections: [],
    allFlows: [],
  };

  it('correctly calculates summary totals', () => {
    const flows: Flow[] = [
      {
        kind: 'INFLOW',
        accountId: 'checking',
        amount: 2000,
        dayOffset: 5,
        meta: { source: 'PLANNED', label: 'Salary' } as any,
      },
      {
        kind: 'OUTFLOW',
        accountId: 'checking',
        amount: 100,
        dayOffset: 10,
        meta: { source: 'PLANNED', label: 'Internet' } as any,
      },
      {
        kind: 'OUTFLOW',
        accountId: 'checking',
        amount: 50,
        dayOffset: 2,
        meta: { source: 'BUDGET', label: 'Groceries' } as any,
      },
    ];

    const report = SimulationReportGenerator.generate(flows, mockSimulationResult, accountMap, []);

    expect(report.summary.totalFutureInflow).toBe(2000);
    expect(report.summary.totalPlannedInflow).toBe(2000);
    expect(report.summary.totalPlannedOutflow).toBe(100);
    // Groceries (BUDGET) is committed, but Internet (PLANNED) is too.
    // Budget flows are in 'committed', Planned are also in 'committed'.
    expect(report.summary.totalCommittedPlanned).toBe(150);
  });

  it('prevents double-counting liabilities in committed section', () => {
    // A liability flow should go to 'debt', not 'committed'
    const flows: Flow[] = [
      {
        kind: 'OUTFLOW',
        accountId: 'cc',
        amount: 300,
        dayOffset: 20,
        meta: { source: 'LIABILITY', label: 'CC Payment', referenceId: 'cc' } as any,
      },
    ];

    const report = SimulationReportGenerator.generate(flows, mockSimulationResult, accountMap, [
      { account: accountMap.get('cc')!, balance: 500 },
    ]);

    expect(report.committed).toHaveLength(0);
    expect(report.debt).toHaveLength(1);
    expect(report.debt[0].amount).toBe(300);
    expect(report.liabilities.total).toBe(500);
    expect(report.liabilities.committed).toBe(300);
  });
});
