import { Observable } from 'rxjs';

import {
  reactiveCacheCoordinator,
  REACTIVE_CACHE_NAMESPACES,
} from '@/src/services/reactive/ReactiveCacheCoordinator';
import { WorkplaceId } from '@/src/types/ids';

function sourceWithTeardown(teardown: jest.Mock): Observable<number> {
  return new Observable(() => teardown);
}

describe('ReactiveCacheCoordinator', () => {
  beforeEach(() => {
    reactiveCacheCoordinator.clearAll();
  });

  afterEach(() => {
    reactiveCacheCoordinator.clearAll();
  });

  it('shares a scoped stream and disposes only the evicted workplace', () => {
    const firstWorkplace = 'workplace-one' as WorkplaceId;
    const secondWorkplace = 'workplace-two' as WorkplaceId;
    const firstTeardown = jest.fn();
    const secondTeardown = jest.fn();
    const firstSource = jest.fn(() => sourceWithTeardown(firstTeardown));
    const secondSource = jest.fn(() => sourceWithTeardown(secondTeardown));

    const first = reactiveCacheCoordinator.getOrCreate({
      namespace: REACTIVE_CACHE_NAMESPACES.workplaceAccounts,
      key: firstWorkplace,
      workplaceId: firstWorkplace,
      createSource: firstSource,
    });
    const firstAgain = reactiveCacheCoordinator.getOrCreate({
      namespace: REACTIVE_CACHE_NAMESPACES.workplaceAccounts,
      key: firstWorkplace,
      workplaceId: firstWorkplace,
      createSource: firstSource,
    });
    const second = reactiveCacheCoordinator.getOrCreate({
      namespace: REACTIVE_CACHE_NAMESPACES.workplaceAccounts,
      key: secondWorkplace,
      workplaceId: secondWorkplace,
      createSource: secondSource,
    });

    const firstSubscription = first.subscribe();
    const secondSubscription = second.subscribe();

    expect(firstAgain).toBe(first);
    expect(firstSource).toHaveBeenCalledTimes(1);
    expect(secondSource).toHaveBeenCalledTimes(1);

    reactiveCacheCoordinator.clearNamespace(
      REACTIVE_CACHE_NAMESPACES.workplaceAccounts,
      firstWorkplace,
    );

    expect(firstTeardown).toHaveBeenCalledTimes(1);
    expect(secondTeardown).not.toHaveBeenCalled();

    secondSubscription.unsubscribe();
    firstSubscription.unsubscribe();
  });

  it('invalidates account-dependent streams without evicting active-count streams', () => {
    const workplaceId = 'workplace-one' as WorkplaceId;
    const teardown = jest.fn();
    const createSource = () => sourceWithTeardown(teardown);
    const subscriptions = [
      reactiveCacheCoordinator.getOrCreate({
        namespace: REACTIVE_CACHE_NAMESPACES.dashboard,
        key: 'USD_workplace-one',
        workplaceId,
        createSource,
      }),
      reactiveCacheCoordinator.getOrCreate({
        namespace: REACTIVE_CACHE_NAMESPACES.aggregatedAccountBalances,
        key: 'USD_workplace-one',
        workplaceId,
        createSource,
      }),
      reactiveCacheCoordinator.getOrCreate({
        namespace: REACTIVE_CACHE_NAMESPACES.workplaceActiveCount,
        key: workplaceId,
        workplaceId,
        createSource,
      }),
    ].map(observable => observable.subscribe());

    reactiveCacheCoordinator.invalidateAccountArchiveCaches();

    expect(teardown).toHaveBeenCalledTimes(2);
    expect(
      reactiveCacheCoordinator.hasNamespace(REACTIVE_CACHE_NAMESPACES.workplaceActiveCount),
    ).toBe(true);

    subscriptions.forEach(subscription => subscription.unsubscribe());
  });
});
