import { evictWorkplaceReactiveCaches } from '@/src/services/reactive/evictWorkplaceReactiveCaches';
import { reactiveCacheCoordinator } from '@/src/services/reactive/ReactiveCacheCoordinator';
import { WorkplaceId } from '@/src/types/ids';

jest.mock('@/src/services/reactive/ReactiveCacheCoordinator', () => ({
  reactiveCacheCoordinator: { clearAll: jest.fn() },
}));

describe('evictWorkplaceReactiveCaches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears all reactive caches for the departing workplace through one owner', () => {
    const oldWorkplace = 'old-workplace' as WorkplaceId;
    const newWorkplace = 'new-workplace' as WorkplaceId;

    evictWorkplaceReactiveCaches({ from: oldWorkplace, to: newWorkplace });
    expect(reactiveCacheCoordinator.clearAll).toHaveBeenCalledWith(oldWorkplace);
  });
});
