import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';

describe('runTasksWithBoundedConcurrency', () => {
  it('does nothing for an empty list', async () => {
    const task = jest.fn();
    await runTasksWithBoundedConcurrency([], 3, task);
    expect(task).not.toHaveBeenCalled();
  });

  it('runs every item exactly once', async () => {
    const seen: number[] = [];
    await runTasksWithBoundedConcurrency([1, 2, 3, 4], 2, async n => {
      seen.push(n);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    await runTasksWithBoundedConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(20);
      inFlight -= 1;
    });

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
