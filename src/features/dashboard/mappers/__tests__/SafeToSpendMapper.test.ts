import { SafeToSpendMapper } from '@/src/features/dashboard/mappers/SafeToSpendMapper';
import { SafeToSpendResult } from '@/src/services/notification/NotificationService';
import { AppConfig } from '@/src/constants';

jest.mock('@/src/utils/currencyFormatter', () => ({
  CurrencyFormatter: {
    format: jest.fn(val => `$${val}`),
  },
}));

describe('SafeToSpendMapper', () => {
  const mockResult: SafeToSpendResult = {
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
      income: [],
      committed: [],
      debt: [],
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
    dailyBudgetBurn: 0,
    projection: { history: [], projection: [], safeDaysCount: null, safeToSpend: 0 },
  };

  const mockOptions = {
    isPrivacyMode: false,
    isLoading: false,
    currencyCode: 'USD',
  };

  it('throws error if report is missing', () => {
    expect(() => SafeToSpendMapper.mapToViewModel({} as any, mockOptions)).toThrow(
      'SafeToSpendMapper: Simulation report is missing',
    );
  });

  it('correctly calculates effectiveTotal for bar chart scale', () => {
    // Assets: 1500
    // Commitments: 400 (planned) + 100 (liability) = 500
    // Safe: 1000
    // Total sum: 500 + 1000 = 1500
    // effectiveTotal should be 1500
    const vm = SafeToSpendMapper.mapToViewModel(mockResult, mockOptions);
    expect(vm.effectiveTotal).toBe(1500);
  });

  it('uses totalLiquidAssets if it exceeds projected components (buffer scenario)', () => {
    const bufferedResult = {
      ...mockResult,
      totalLiquidAssets: 2000, // 500 buffer above safe + commitments
    };
    const vm = SafeToSpendMapper.mapToViewModel(bufferedResult as any, mockOptions);
    expect(vm.effectiveTotal).toBe(2000);
  });

  it('handles privacy mode correctly', () => {
    const privacyOptions = { ...mockOptions, isPrivacyMode: true };
    const vm = SafeToSpendMapper.mapToViewModel(mockResult, privacyOptions);
    expect(vm.displaySafeToSpend).toBe(AppConfig.privacyMask);
  });

  it('handles small values with "< $1" formatting', () => {
    const smallResult = {
      ...mockResult,
      summary: { ...mockResult.summary, safeToSpend: 0.2 },
    };
    const vm = SafeToSpendMapper.mapToViewModel(smallResult as any, mockOptions);
    expect(vm.displaySafeToSpend).toBe('< $1');
  });
});
