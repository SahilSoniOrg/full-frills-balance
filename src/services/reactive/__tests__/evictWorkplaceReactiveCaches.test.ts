import { evictWorkplaceReactiveCaches } from '@/src/services/reactive/evictWorkplaceReactiveCaches';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { safeToSpendReadModel } from '@/src/services/simulation/SafeToSpendReadModel';
import { insightService } from '@/src/services/insight/InsightService';
import { WorkplaceId } from '@/src/types/ids';

jest.mock('@/src/services/ReactiveDataService', () => ({
  reactiveDataService: { clearCache: jest.fn() },
}));
jest.mock('@/src/services/simulation/SafeToSpendReadModel', () => ({
  safeToSpendReadModel: { clearCache: jest.fn() },
}));
jest.mock('@/src/services/insight/InsightService', () => ({
  insightService: { clearCache: jest.fn() },
}));

describe('evictWorkplaceReactiveCaches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears dashboard, safe-to-spend, and insight caches', () => {
    const oldWorkplace = 'old-workplace' as WorkplaceId;
    const newWorkplace = 'new-workplace' as WorkplaceId;

    evictWorkplaceReactiveCaches({ from: oldWorkplace, to: newWorkplace });
    expect(reactiveDataService.clearCache).toHaveBeenCalledWith(oldWorkplace);
    expect(safeToSpendReadModel.clearCache).toHaveBeenCalled();
    expect(insightService.clearCache).toHaveBeenCalledWith(oldWorkplace);
  });
});
