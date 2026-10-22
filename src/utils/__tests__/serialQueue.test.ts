import { SerialQueue } from '../serialQueue';

it('holds queued work until a failed operation settles, then continues in order', async () => {
  const queue = new SerialQueue();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => {
    release = resolve;
  });
  const events: string[] = [];
  const first = queue.run(async () => {
    events.push('first-start');
    await blocked;
    events.push('first-failed');
    throw new Error('storage unavailable');
  });
  const rejected = expect(first).rejects.toThrow('storage unavailable');
  const second = queue.run(async () => {
    events.push('second');
    return 2;
  });
  const third = queue.run(async () => {
    events.push('third');
    return 3;
  });
  await Promise.resolve();
  expect(events).toEqual(['first-start']);
  release();
  await rejected;
  await expect(second).resolves.toBe(2);
  await expect(third).resolves.toBe(3);
  expect(events).toEqual(['first-start', 'first-failed', 'second', 'third']);
});
