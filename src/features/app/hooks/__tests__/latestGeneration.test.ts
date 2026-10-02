import { LatestGenerationCoordinator } from '@/src/services/LatestGenerationCoordinator';

describe('LatestGenerationCoordinator', () => {
  it('aborts the previous lease immediately when a new generation begins', () => {
    const coordinator = new LatestGenerationCoordinator();
    const generationA = coordinator.begin();

    expect(generationA.signal.aborted).toBe(false);
    expect(generationA.isCurrent()).toBe(true);

    const generationB = coordinator.begin();

    expect(generationA.signal.aborted).toBe(true);
    expect(generationA.isCurrent()).toBe(false);
    expect(generationB.signal.aborted).toBe(false);
    expect(generationB.isCurrent()).toBe(true);
  });

  it('aborts its signal when explicitly cancelled', () => {
    const lease = new LatestGenerationCoordinator().begin();

    lease.cancel();

    expect(lease.signal.aborted).toBe(true);
    expect(lease.isCurrent()).toBe(false);
  });
});
