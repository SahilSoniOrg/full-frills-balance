import { BehaviorSubject, NEVER, Observable, Subject, of } from 'rxjs';

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
  exchangeRateRepository: { observeRevision: jest.fn() },
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
  selectBalancesForWealthSummary: (balances: readonly unknown[]) => balances,
  wealthService: { calculateSummary: jest.fn() },
}));
describe('reactiveAggregatedBalances lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reactiveCacheCoordinator.clearNamespace(REACTIVE_CACHE_NAMESPACES.aggregatedAccountBalances);
    (observeWorkplaceJournalMeta as jest.Mock).mockReturnValue(NEVER);
    (observeWorkplaceActiveTransactionCount as jest.Mock).mockReturnValue(NEVER);
    (exchangeRateRepository.observeRevision as jest.Mock).mockReturnValue(NEVER);
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

  it('recalculates when exchange rates change without any account change', async () => {
    const workplaceId = 'workplace-one' as WorkplaceId;
    const revision$ = new BehaviorSubject(0);
    (observeWorkplaceAccounts as jest.Mock).mockReturnValue(of([]));
    (observeWorkplaceJournalMeta as jest.Mock).mockReturnValue(of([]));
    (observeWorkplaceActiveTransactionCount as jest.Mock).mockReturnValue(of(0));
    (exchangeRateRepository.observeRevision as jest.Mock).mockReturnValue(revision$);
    (wealthService.calculateSummary as jest.Mock).mockResolvedValue({ netWorth: 0 });

    const emissions: unknown[] = [];
    const subscription = observeAggregatedAccountBalances('USD', workplaceId).subscribe(value =>
      emissions.push(value),
    );
    const waitForEmissions = async (count: number) => {
      for (let attempts = 0; attempts < 100 && emissions.length < count; attempts += 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };

    await waitForEmissions(1);
    revision$.next(1);
    await waitForEmissions(2);
    subscription.unsubscribe();

    expect(emissions).toHaveLength(2);
    expect(accountListMetricsQueries.getAccountListItemsRaw).toHaveBeenCalledTimes(2);
  });

  it('does not emit a stale balance result when disposed during an async calculation', async () => {
    const workplaceId = 'workplace-one' as WorkplaceId;
    const accounts$ = new Subject<[]>();
    let resolveWealth: ((summary: unknown) => void) | undefined;
    const wealthPromise = new Promise(resolve => {
      resolveWealth = resolve;
    });

    (observeWorkplaceAccounts as jest.Mock).mockReturnValue(accounts$);
    (observeWorkplaceJournalMeta as jest.Mock).mockReturnValue(of([]));
    (observeWorkplaceActiveTransactionCount as jest.Mock).mockReturnValue(of(0));
    (exchangeRateRepository.observeRevision as jest.Mock).mockReturnValue(of(0));
    (wealthService.calculateSummary as jest.Mock).mockReturnValue(wealthPromise);
    const calculateSummary = wealthService.calculateSummary as jest.Mock;

    const next = jest.fn();
    observeAggregatedAccountBalances('USD', workplaceId).subscribe({ next });
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

    expect(next).not.toHaveBeenCalled();
  });
});
