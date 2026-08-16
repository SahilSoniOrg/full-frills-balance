import { LatestGenerationCoordinator } from '@/src/features/app/hooks/latestGeneration';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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

  it('serializes a newer write behind an older in-flight write', async () => {
    const coordinator = new LatestGenerationCoordinator();
    const firstWrite = deferred();
    const events: string[] = [];

    const generationA = coordinator.begin();
    const resultA = generationA.runSerialized(async () => {
      events.push('a:start');
      await firstWrite.promise;
      events.push('a:end');
    });
    await Promise.resolve();

    const generationB = coordinator.begin();
    const resultB = generationB.runSerialized(() => {
      events.push('b');
    });

    expect(events).toEqual(['a:start']);
    firstWrite.resolve();
    await Promise.all([resultA, resultB]);

    expect(events).toEqual(['a:start', 'a:end', 'b']);
  });

  it('drops stale work before it reaches the write queue', async () => {
    const coordinator = new LatestGenerationCoordinator();
    const staleWrite = jest.fn();
    const generationA = coordinator.begin();
    coordinator.begin();

    await expect(generationA.runSerialized(staleWrite)).resolves.toBe(false);
    expect(staleWrite).not.toHaveBeenCalled();
  });

  it('drops serialized work that becomes stale before its critical section', async () => {
    const coordinator = new LatestGenerationCoordinator();
    const firstWrite = deferred();
    const generationA = coordinator.begin();
    const resultA = generationA.runSerialized(() => firstWrite.promise);
    await Promise.resolve();

    const generationB = coordinator.begin();
    const staleWrite = jest.fn();
    const resultB = generationB.runSerialized(staleWrite);
    expect(generationB.isCurrent()).toBe(true);

    coordinator.begin();
    firstWrite.resolve();

    await expect(resultA).resolves.toBe(true);
    await expect(resultB).resolves.toBe(false);
    expect(staleWrite).not.toHaveBeenCalled();
  });
});
