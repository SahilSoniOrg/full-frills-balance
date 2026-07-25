import { evictWorkplaceReactiveCaches } from '@/src/services/reactive/evictWorkplaceReactiveCaches';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { safeToSpendReadModel } from '@/src/services/simulation/SafeToSpendReadModel';
import { insightService } from '@/src/services/insight/InsightService';

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
    evictWorkplaceReactiveCaches();
    expect(reactiveDataService.clearCache).toHaveBeenCalled();
    expect(safeToSpendReadModel.clearCache).toHaveBeenCalled();
    expect(insightService.clearCache).toHaveBeenCalled();
  });
});
