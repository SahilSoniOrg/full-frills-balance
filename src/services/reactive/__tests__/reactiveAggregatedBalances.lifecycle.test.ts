import { NEVER, Observable, Subject, of } from 'rxjs';

import { accountListMetricsQueries } from '@/src/data/repositories/account/AccountListMetricsQueries';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { balanceHierarchyAggregator } from '@/src/services/balance/balanceHierarchyAggregator';
import { currencyReadService } from '@/src/services/currency-read-service';
import { observeAggregatedAccountBalances } from '@/src/services/reactive/reactiveAggregatedBalances';
import {
  observeWorkplaceAccounts,
  observeWorkplaceActiveTransactionCount,
  observeWorkplaceJournalMeta,
} from '@/src/services/reactive/reactiveWorkplaceObserves';
import { wealthService } from '@/src/services/wealth-service';
import { WorkplaceId } from '@/src/types/ids';
import { snapshotService } from '@/src/utils/SnapshotService';
import {
  reactiveCacheCoordinator,
  REACTIVE_CACHE_NAMESPACES,
} from '@/src/services/reactive/ReactiveCacheCoordinator';

jest.mock('@/src/services/reactive/reactiveWorkplaceObserves', () => ({
  observeWorkplaceAccounts: jest.fn(),
  observeWorkplaceActiveTransactionCount: jest.fn(),
  observeWorkplaceJournalMeta: jest.fn(),
}));
jest.mock('@/src/data/repositories/ExchangeRateRepository', () => ({
  exchangeRateRepository: { observeAll: jest.fn() },
}));
jest.mock('@/src/data/repositories/account/AccountListMetricsQueries', () => ({
  accountListMetricsQueries: { getAccountListItemsRaw: jest.fn() },
}));
jest.mock('@/src/services/balance/balanceHierarchyAggregator', () => ({
  balanceHierarchyAggregator: { aggregateBalances: jest.fn() },
}));
jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: { getAllPrecisions: jest.fn() },
}));
jest.mock('@/src/services/wealth-service', () => ({
  wealthService: { calculateSummary: jest.fn() },
}));
jest.mock('@/src/utils/SnapshotService', () => ({
  snapshotService: { deferWealthSnapshot: jest.fn() },
}));

describe('reactiveAggregatedBalances lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reactiveCacheCoordinator.clearNamespace(REACTIVE_CACHE_NAMESPACES.aggregatedAccountBalances);
    (observeWorkplaceJournalMeta as jest.Mock).mockReturnValue(NEVER);
    (observeWorkplaceActiveTransactionCount as jest.Mock).mockReturnValue(NEVER);
    (exchangeRateRepository.observeAll as jest.Mock).mockReturnValue(NEVER);
    (accountListMetricsQueries.getAccountListItemsRaw as jest.Mock).mockResolvedValue([]);
    (currencyReadService.getAllPrecisions as jest.Mock).mockResolvedValue(new Map());
    (balanceHierarchyAggregator.aggregateBalances as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    reactiveCacheCoordinator.clearNamespace(REACTIVE_CACHE_NAMESPACES.aggregatedAccountBalances);
  });

  it('disposes only the departing workplace upstream observation', () => {
    const firstWorkplace = 'workplace-one' as WorkplaceId;
    const secondWorkplace = 'workplace-two' as WorkplaceId;
    const firstTeardown = jest.fn();
    const secondTeardown = jest.fn();

    (observeWorkplaceAccounts as jest.Mock).mockImplementation(
      (workplaceId: WorkplaceId) =>
        new Observable(() => (workplaceId === firstWorkplace ? firstTeardown : secondTeardown)),
    );

    observeAggregatedAccountBalances('USD', firstWorkplace).subscribe();
    observeAggregatedAccountBalances('USD', secondWorkplace).subscribe();

    reactiveCacheCoordinator.clearNamespace(
      REACTIVE_CACHE_NAMESPACES.aggregatedAccountBalances,
      firstWorkplace,
    );

    expect(firstTeardown).toHaveBeenCalledTimes(1);
    expect(secondTeardown).not.toHaveBeenCalled();

    reactiveCacheCoordinator.clearNamespace(
      REACTIVE_CACHE_NAMESPACES.aggregatedAccountBalances,
      secondWorkplace,
    );
    expect(secondTeardown).toHaveBeenCalledTimes(1);
  });

  it('does not persist wealth when an async balance calculation is disposed', async () => {
    const workplaceId = 'workplace-one' as WorkplaceId;
    const accounts$ = new Subject<[]>();
    let resolveWealth: ((summary: unknown) => void) | undefined;
    const wealthPromise = new Promise(resolve => {
      resolveWealth = resolve;
    });

    (observeWorkplaceAccounts as jest.Mock).mockReturnValue(accounts$);
    (observeWorkplaceJournalMeta as jest.Mock).mockReturnValue(of([]));
    (observeWorkplaceActiveTransactionCount as jest.Mock).mockReturnValue(of(0));
    (exchangeRateRepository.observeAll as jest.Mock).mockReturnValue(of([]));
    (wealthService.calculateSummary as jest.Mock).mockReturnValue(wealthPromise);
    const calculateSummary = wealthService.calculateSummary as jest.Mock;

    observeAggregatedAccountBalances('USD', workplaceId).subscribe();
    accounts$.next([]);
    for (let attempts = 0; attempts < 20 && !calculateSummary.mock.calls.length; attempts += 1) {
      await Promise.resolve();
    }
    expect(wealthService.calculateSummary).toHaveBeenCalled();

    reactiveCacheCoordinator.clearNamespace(
      REACTIVE_CACHE_NAMESPACES.aggregatedAccountBalances,
      workplaceId,
    );
    resolveWealth?.({ netWorth: 123 });
    await wealthPromise;
    await Promise.resolve();

    expect(snapshotService.deferWealthSnapshot).not.toHaveBeenCalled();
  });
});
