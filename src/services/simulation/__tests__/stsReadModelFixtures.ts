import { accountObserveQueries } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawMetricsQueries } from '@/src/data/repositories/raw/TransactionRawMetricsQueries';
import { transactionRawPatternQueries } from '@/src/data/repositories/raw/TransactionRawPatternQueries';
import {
  transactionObserveQueries,
  transactionQueryRepository,
} from '@/src/data/repositories/transaction';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import type { ForecastDateBasisDependencies } from '@/src/services/simulation/forecastDateBasis';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { of } from 'rxjs';

export const STS_TEST_WORKPLACE = 'test-wp' as WorkplaceId;

export const emptySimResult = {
  simulationResult: {
    summary: { safeToSpend: 0, shortfall: 0, trajectoryMinBalance: 0 },
    projections: [],
  },
  report: {
    summary: {
      totalFutureInflow: 0,
      totalPlannedOutflow: 0,
      totalCommittedPlanned: 0,
    },
    budget: { currentMonthRemaining: 0, nextMonthProjected: 0, nextMonthDays: 30 },
  },
  accountSummaries: [],
  accountMap: new Map(),
  normalizedStartingBalances: new Map<string, number>(),
};

export function mockLiquidCashAsset(id = 'cash', currencyCode = 'USD') {
  return {
    id,
    accountType: AccountType.ASSET,
    accountSubtype: AccountSubtype.CASH,
    ...(currencyCode ? { currencyCode } : {}),
  };
}

export function mockCashAssetRow(id = 'a1') {
  return { id, accountType: AccountType.ASSET, accountSubtype: AccountSubtype.CASH };
}

export type ForecastDateBasisTestHarness = {
  dependencies: ForecastDateBasisDependencies;
  timers: Map<number, () => void>;
  setNow: (ms: number) => void;
  advanceNow: (deltaMs: number) => void;
  invokeForeground: () => void;
  foregroundActive: () => boolean;
};

export function createForecastDateBasisTestHarness(
  initialNow = new Date(2026, 8, 30, 9).getTime(),
): ForecastDateBasisTestHarness {
  let now = initialNow;
  let foreground: (() => void) | undefined;
  let nextTimer = 0;
  const timers = new Map<number, () => void>();
  return {
    timers,
    setNow: ms => {
      now = ms;
    },
    advanceNow: deltaMs => {
      now += deltaMs;
    },
    invokeForeground: () => foreground?.(),
    foregroundActive: () => foreground !== undefined,
    dependencies: {
      now: () => now,
      setTimer: callback => {
        const id = ++nextTimer;
        timers.set(id, callback);
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: timer => {
        timers.delete(timer as unknown as number);
      },
      observeForeground: listener => {
        foreground = listener;
        return () => {
          foreground = undefined;
        };
      },
    },
  };
}

export function installStsMocks() {
  (accountObserveQueries.observeByType as jest.Mock).mockReturnValue(of([]));
  (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of([]));
  (budgetRepository.observeAllActive as jest.Mock).mockReturnValue(of([]));
  (plannedPaymentRepository.observeAll as jest.Mock).mockReturnValue(of([]));
  (plannedPaymentRepository.observeActive as jest.Mock).mockReturnValue(of([]));
  (journalObserveQueries.observeStatusMeta as jest.Mock).mockReturnValue(of([]));
  (journalObserveQueries.observePlannedInRange as jest.Mock).mockReturnValue(of([]));
  (journalQueryRepository.findByIds as jest.Mock).mockResolvedValue([]);
  (transactionObserveQueries.observeActiveCount as jest.Mock).mockReturnValue(of(0));
  (transactionQueryRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);
  (transactionQueryRepository.findByJournals as jest.Mock).mockResolvedValue([]);
  (transactionRawPatternQueries.getRecurringPatternsRaw as jest.Mock).mockResolvedValue([]);
  (transactionRawMetricsQueries.getDailyDeltasGroupedRaw as jest.Mock).mockResolvedValue([]);
  (transactionRawMetricsQueries.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
  (exchangeRateService.fetchRatesForBase as jest.Mock).mockResolvedValue({});
  (exchangeRateService.observeSpotRateUpdates as jest.Mock).mockReturnValue(of(''));
  (budgetReadService.observeBudgetUsage as jest.Mock).mockReturnValue(
    of({ remaining: 0, spent: 0 }),
  );
  (balanceReadService.getAccountBalances as jest.Mock).mockResolvedValue([]);
  (workplaceRepository.observeById as jest.Mock).mockReturnValue(
    of({ defaultCurrencyCode: 'USD' }),
  );
  (cashFlowSimulationService.simulate as jest.Mock).mockResolvedValue(emptySimResult);
}

export function createPassiveForecastDateBasisDependencies(
  at = new Date(2026, 8, 30, 12).getTime(),
) {
  const timers = new Map<number, () => void>();
  const dependencies: ForecastDateBasisDependencies = {
    now: () => at,
    setTimer: callback => {
      const id = timers.size + 1;
      timers.set(id, callback);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: timer => timers.delete(timer as unknown as number),
    observeForeground: () => () => undefined,
  };
  return { dependencies, timers };
}
