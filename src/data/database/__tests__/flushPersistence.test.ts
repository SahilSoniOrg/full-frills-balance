import { database } from '../Database';
import { flushDatabasePersistence } from '../flushPersistence.web';

jest.mock('../Database', () => ({ database: { adapter: { unsafeExecute: jest.fn() } } }));

it('does not acknowledge persistence when adapter dispatch finishes before the IndexedDB save', async () => {
  let complete!: (error?: Error | null) => void;
  jest.mocked(database.adapter.unsafeExecute).mockImplementation(async work => {
    if (!('loki' in work)) throw new Error('Expected browser persistence');
    work.loki({
      saveDatabase: (callback: typeof complete) => {
        complete = callback;
      },
    } as Parameters<typeof work.loki>[0]);
  });
  let acknowledged = false;
  const saving = flushDatabasePersistence().then(() => {
    acknowledged = true;
  });
  await Promise.resolve();
  expect(acknowledged).toBe(false);
  complete();
  await saving;
  expect(acknowledged).toBe(true);
});

it('propagates an IndexedDB save failure instead of completing later checkpoints', async () => {
  const failure = new Error('IndexedDB save failed');
  jest.mocked(database.adapter.unsafeExecute).mockImplementation(async work => {
    if (!('loki' in work)) throw new Error('Expected browser persistence');
    work.loki({
      saveDatabase: (callback: (error: Error) => void) => callback(failure),
    } as Parameters<typeof work.loki>[0]);
  });
  await expect(flushDatabasePersistence()).rejects.toBe(failure);
});

it('propagates adapter dispatch failure without waiting for a callback that will never run', async () => {
  const failure = new Error('Adapter unavailable');
  jest.mocked(database.adapter.unsafeExecute).mockRejectedValueOnce(failure);
  await expect(flushDatabasePersistence()).rejects.toBe(failure);
});
