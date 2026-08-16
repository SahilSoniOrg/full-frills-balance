import { LatestGenerationCoordinator } from '@/src/features/app/hooks/latestGeneration';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('LatestGenerationCoordinator', () => {
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
});
