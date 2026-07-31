import { AppConfig } from '@/src/constants';
import { SafeToSpendMapper } from '@/src/features/dashboard/mappers/SafeToSpendMapper';
import { SafeToSpendDashboard } from '@/src/services/simulation/SafeToSpendReadModel';
import { FlowCategory, FlowSource } from '@/src/services/simulation/types';
import { AccountId } from '@/src/types/domain';

jest.mock('@/src/utils/currencyFormatter', () => ({
  CurrencyFormatter: {
    format: jest.fn(val => `$${val}`),
  },
}));

describe('SafeToSpendMapper', () => {
  const mockResult: SafeToSpendDashboard = {
    summary: {
      safeToSpend: 1000,
      shortfall: 0,
      trajectoryMinBalance: 500,
      safeDaysCount: 30,
      totalFutureInflow: 2000,
      totalPlannedInflow: 2000,
      totalPlannedOutflow: 500,
      totalCommittedPlanned: 400,
      firstMajorInflowDay: 15,
    },
    report: {
      summary: {
        firstMajorInflowDay: 15,
        totalFutureInflow: 2000,
        totalPlannedInflow: 2000,
        totalPlannedOutflow: 500,
        totalCommittedPlanned: 400,
      },
      allFlows: [
        {
          kind: 'INFLOW',
          accountId: 'checking' as AccountId,
          amount: 2000,
          dayOffset: 15,
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
          dayOffset: 5,
          category: FlowCategory.BUDGET,
          timeframe: 'FUTURE',
          label: 'Groceries',
          origin: FlowSource.BUDGET,
          referenceId: 'groceries',
        },
        {
          kind: 'OUTFLOW',
          accountId: 'checking' as AccountId,
          amount: 50,
          dayOffset: 10,
          category: FlowCategory.DEBT,
          timeframe: 'FUTURE',
          label: 'CC Bill',
          origin: FlowSource.LIABILITY,
          referenceId: 'cc',
        },
      ],
      budget: { currentMonthRemaining: 100, nextMonthProjected: 200, nextMonthDays: 30 },
      liabilities: {
        total: 500,
        totalCreditCard: 300,
        totalOther: 200,
        committed: 100,
        committedCreditCard: 50,
        committedOther: 50,
      },
    },
    totalLiquidAssets: 1500,
    currencyCode: 'USD',
    accountSummaries: [],
    liquidAssetSubtypes: [],
    accountMap: new Map(),
    dailyBudgetBurn: 0,
    safeToSpendDays: 0,
    projection: { history: [], projection: [], safeDaysCount: null, safeToSpend: 0 },
  };

  const mockOptions = {
    isPrivacyMode: false,
    isLoading: false,
    currencyCode: 'USD',
  };

  const mapToVM = (res = mockResult, opt = mockOptions) =>
    SafeToSpendMapper.mapToViewModel(
      {
        ...res,
        accountMap: res.accountMap || new Map(),
      } as any,
      opt,
    );

  it('returns fallback data if report is missing', () => {
    const vm = SafeToSpendMapper.mapToViewModel({} as any, mockOptions);
    expect(vm.safeToSpend).toBe(0);
    expect(vm.displaySafeToSpend).toBe('---');
  });

  it('correctly calculates effectiveTotal for bar chart scale', () => {
    // Assets: 1500
    // Commitments: 400 (planned) + 100 (liability) = 500
    // Safe: 1000
    // Total sum: 500 + 1000 = 1500
    // effectiveTotal should be 1500
    const vm = mapToVM();
    expect(vm.effectiveTotal).toBe(1500);
  });

  it('uses totalLiquidAssets if it exceeds projected components (buffer scenario)', () => {
    const bufferedResult = {
      ...mockResult,
      totalLiquidAssets: 2000, // 500 buffer above safe + commitments
    };
    const vm = mapToVM(bufferedResult as any);
    expect(vm.effectiveTotal).toBe(2000);
  });

  it('handles privacy mode by masking display values while keeping raw list amounts', () => {
    const privacyOptions = { ...mockOptions, isPrivacyMode: true };
    const vm = mapToVM(mockResult, privacyOptions);

    // Masked display values
    expect(vm.displaySafeToSpend).toBe(AppConfig.privacyMask);
    expect(vm.displayTotalLiquidAssets).toBe(AppConfig.privacyMask);
    expect(vm.isPrivacyMode).toBe(true);

    // Raw list amounts preserved — leaves format from isPrivacyMode / formatValue
    expect(vm.income[0].amount).not.toBe(0);
    expect(vm.committed[0]?.amount).not.toBe(0);
    expect(vm.debt[0]?.amount).not.toBe(0);
  });

  it('handles small values with "< $1" formatting', () => {
    const smallResult = {
      ...mockResult,
      summary: { ...mockResult.summary, safeToSpend: 0.2 },
    };
    const vm = mapToVM(smallResult as any);
    expect(vm.displaySafeToSpend).toBe('< $1');
  });

  it('resolves dynamic labels with safeToSpendDays', () => {
    const days = 45;
    const vm = mapToVM({ ...mockResult, safeToSpendDays: days });

    // Check if one of the formula items contains the days
    const incomingStr = vm.info.formulaItems[1];
    expect(typeof incomingStr).toBe('string');
    expect(incomingStr).toContain('45 days');
  });
});
