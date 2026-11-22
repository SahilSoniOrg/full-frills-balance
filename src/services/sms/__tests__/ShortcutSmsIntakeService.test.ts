import ShortcutSmsModule from '@/modules/expo-sms-inbox/shortcut';
import { database } from '@/src/data/database/Database';
import { shortcutSmsIntakeService } from '@/src/services/sms/ShortcutSmsIntakeService';
import { smsSyncPipeline } from '@/src/services/sms/pipeline/smsSyncPipeline';
import { asWorkplaceId } from '@/src/types/ids';

jest.mock('@/modules/expo-sms-inbox/shortcut', () => ({
  getPending: jest.fn(),
  acknowledge: jest.fn().mockResolvedValue(undefined),
  stageReset: jest.fn().mockResolvedValue(undefined),
  hasStagedReset: jest.fn().mockResolvedValue(false),
  finishReset: jest.fn().mockResolvedValue(undefined),
  purgeRetired: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/data/database/Database', () => ({
  database: { adapter: { getLocal: jest.fn(), setLocal: jest.fn() } },
}));
jest.mock('@/src/services/preferences', () => ({ preferences: { device: {} } }));
jest.mock('@/src/services/sms/pipeline/smsSyncPipeline', () => ({
  smsSyncPipeline: { scanMessages: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

it('drains untouched alerts under the Workplace requested during a write', async () => {
  if (!ShortcutSmsModule) throw new Error('Expected the mocked Shortcuts queue');
  const queue = jest.mocked(ShortcutSmsModule);
  const scan = jest.mocked(smsSyncPipeline.scanMessages);
  const first = { id: 'first', address: 'bank', body: 'INR 100 debited', date: 1 };
  const pending = { ...first, id: 'pending', date: 2 };
  const newArrival = { ...first, id: 'new', date: 3 };
  const home = asWorkplaceId('home');
  const work = asWorkplaceId('work');
  const firstWriteStarted = deferred<void>();
  const firstWrite = deferred<number>();
  queue.getPending.mockResolvedValueOnce([first, pending]);
  queue.getPending.mockResolvedValueOnce([pending, newArrival]);
  scan.mockImplementationOnce(() => {
    firstWriteStarted.resolve();
    return firstWrite.promise;
  });
  scan.mockResolvedValue(0);

  const initialDrain = shortcutSmsIntakeService.process(home);
  await firstWriteStarted.promise;
  const nextDrain = shortcutSmsIntakeService.process(work);
  firstWrite.resolve(0);
  await Promise.all([initialDrain, nextDrain]);

  expect(scan.mock.calls).toEqual([
    [home, [first], undefined, { origin: 'shortcut' }],
    [work, [pending], undefined, { origin: 'shortcut' }],
    [work, [newArrival], undefined, { origin: 'shortcut' }],
  ]);
  expect(queue.acknowledge.mock.calls).toEqual([['first'], ['pending'], ['new']]);
});

it('continues past scan and acknowledgement failures and retries the failed alerts', async () => {
  if (!ShortcutSmsModule) throw new Error('Expected the mocked Shortcuts queue');
  const queue = jest.mocked(ShortcutSmsModule);
  const scan = jest.mocked(smsSyncPipeline.scanMessages);
  const first = { id: 'first', address: 'bank', body: 'INR 100 debited', date: 1 };
  const second = { ...first, id: 'second', date: 2 };
  const later = { ...first, id: 'later', date: 3 };
  const home = asWorkplaceId('home');
  const scanError = new Error('scan failed');
  queue.getPending.mockResolvedValueOnce([first, second, later]);
  queue.getPending.mockResolvedValueOnce([first, second]);
  scan.mockRejectedValueOnce(scanError).mockResolvedValue(0);
  queue.acknowledge.mockRejectedValueOnce(new Error('acknowledgement failed'));

  await expect(shortcutSmsIntakeService.process(home)).rejects.toBe(scanError);
  expect(scan.mock.calls.map(([, messages]) => messages[0])).toEqual([first, second, later]);
  expect(queue.acknowledge.mock.calls).toEqual([['second'], ['later']]);

  await shortcutSmsIntakeService.process(home);
  expect(scan.mock.calls.map(([, messages]) => messages[0])).toEqual([
    first,
    second,
    later,
    first,
    second,
  ]);
  expect(queue.acknowledge.mock.calls).toEqual([['second'], ['later'], ['first'], ['second']]);
});

it('keeps the current queue when the database reset rejects', async () => {
  if (!ShortcutSmsModule) throw new Error('Expected the mocked Shortcuts queue');
  const queue = jest.mocked(ShortcutSmsModule);
  const resetError = new Error('reset failed');

  await expect(
    shortcutSmsIntakeService.resetWithDatabase(async () => {
      expect(database.adapter.setLocal).toHaveBeenCalledTimes(1);
      expect(queue.stageReset).toHaveBeenCalledTimes(1);
      expect(queue.finishReset).not.toHaveBeenCalled();
      throw resetError;
    }),
  ).rejects.toBe(resetError);
  expect(queue.finishReset).toHaveBeenCalledWith(false);
  expect(queue.purgeRetired).not.toHaveBeenCalled();
});

it.each([
  { marker: '1', committed: false },
  { marker: undefined, committed: true },
])(
  'recovers the staged generation with commit status $committed',
  async ({ marker, committed }) => {
    if (!ShortcutSmsModule) throw new Error('Expected the mocked Shortcuts queue');
    const queue = jest.mocked(ShortcutSmsModule);
    queue.hasStagedReset.mockResolvedValueOnce(true);
    jest.mocked(database.adapter.getLocal).mockResolvedValueOnce(marker);
    queue.getPending.mockResolvedValueOnce([]);

    await shortcutSmsIntakeService.process(asWorkplaceId('home'));

    expect(queue.finishReset).toHaveBeenCalledWith(committed);
    expect(queue.finishReset.mock.invocationCallOrder[0]).toBeLessThan(
      queue.getPending.mock.invocationCallOrder[0],
    );
  },
);
