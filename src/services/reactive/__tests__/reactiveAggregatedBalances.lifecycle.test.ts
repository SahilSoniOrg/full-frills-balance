import { NEVER, Observable } from 'rxjs';

import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import {
  clearReactiveAggregatedBalancesCache,
  observeAggregatedAccountBalances,
} from '@/src/services/reactive/reactiveAggregatedBalances';
import {
  observeWorkplaceAccounts,
  observeWorkplaceActiveTransactionCount,
  observeWorkplaceJournalMeta,
} from '@/src/services/reactive/reactiveWorkplaceObserves';
import { WorkplaceId } from '@/src/types/domain';

jest.mock('@/src/services/reactive/reactiveWorkplaceObserves', () => ({
  observeWorkplaceAccounts: jest.fn(),
  observeWorkplaceActiveTransactionCount: jest.fn(),
  observeWorkplaceJournalMeta: jest.fn(),
}));
jest.mock('@/src/data/repositories/ExchangeRateRepository', () => ({
  exchangeRateRepository: { observeAll: jest.fn() },
}));

describe('reactiveAggregatedBalances lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearReactiveAggregatedBalancesCache();
    (observeWorkplaceJournalMeta as jest.Mock).mockReturnValue(NEVER);
    (observeWorkplaceActiveTransactionCount as jest.Mock).mockReturnValue(NEVER);
    (exchangeRateRepository.observeAll as jest.Mock).mockReturnValue(NEVER);
  });

  afterEach(() => {
    clearReactiveAggregatedBalancesCache();
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

    clearReactiveAggregatedBalancesCache(firstWorkplace);

    expect(firstTeardown).toHaveBeenCalledTimes(1);
    expect(secondTeardown).not.toHaveBeenCalled();

    clearReactiveAggregatedBalancesCache(secondWorkplace);
    expect(secondTeardown).toHaveBeenCalledTimes(1);
  });
});
