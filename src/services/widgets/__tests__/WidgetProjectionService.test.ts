import { WidgetProjectionService } from '../WidgetProjectionService';
import { loadNativeWidgetAdapter } from '../nativeWidgetAdapter';
import { logger } from '@/src/utils/logger';
import { storage } from '@/src/utils/storage';
import { createNativeWidgetsStub } from '@/src/testing/mockNativeWidgets';

async function flushUntilStarted(started: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20 && !started(); attempt += 1) await Promise.resolve();
  if (!started()) throw new Error('Expected native widget operation to start');
}

const nativeWidgets = createNativeWidgetsStub();

jest.mock('../nativeWidgetAdapter', () =>
  require('@/src/testing/mockNativeWidgets').nativeWidgetAdapterModuleMock(),
);
jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn() },
}));
jest.mock('@/src/utils/storage', () => ({
  storage: {
    set: jest.fn(),
    remove: jest.fn(),
    getString: jest.fn(() => undefined),
    getAllKeys: jest.fn(() => []),
    getBoolean: jest.fn(() => false),
  },
}));

describe('WidgetProjectionService', () => {
  let service: WidgetProjectionService;

  beforeEach(() => {
    (loadNativeWidgetAdapter as jest.Mock).mockResolvedValue(nativeWidgets);
    nativeWidgets.syncWidgetData.mockReset().mockResolvedValue(undefined);
    nativeWidgets.clearWidgetData.mockReset().mockResolvedValue(undefined);
    (storage.getBoolean as jest.Mock).mockReturnValue(false);
    (storage.getString as jest.Mock).mockReturnValue(undefined);
    (storage.getAllKeys as jest.Mock).mockReturnValue([]);
    (storage.set as jest.Mock).mockReset();
    (storage.remove as jest.Mock).mockReset();
    (logger.warn as jest.Mock).mockClear();
    service = new WidgetProjectionService();
  });

  it('clears an in-flight deleted owner before a newly published workplace writes', async () => {
    let finishSync!: () => void;
    nativeWidgets.syncWidgetData.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishSync = resolve;
        }),
    );
    const lease = service.begin('wp-a' as never);
    const publishing = lease.publish({} as never);
    await flushUntilStarted(() => typeof finishSync === 'function');

    const clearing = service.clearWorkplace('wp-a' as never, 'wp-a' as never);
    const nextLease = service.begin('wp-b' as never);
    const nextPublish = nextLease.publish({ next: true } as never);
    finishSync();
    await publishing;
    await clearing;
    await nextPublish;

    expect(nativeWidgets.syncWidgetData).toHaveBeenNthCalledWith(1, {});
    expect(nativeWidgets.syncWidgetData).toHaveBeenNthCalledWith(2, { next: true });
    expect(nativeWidgets.clearWidgetData).toHaveBeenCalledTimes(1);
  });

  it('does not clear the active workplace widget when an inactive workplace is deleted', async () => {
    await service.clearWorkplace('wp-a' as never, 'wp-b' as never);
    expect(nativeWidgets.clearWidgetData).not.toHaveBeenCalled();
  });

  it('clears an active persisted widget after a cold start with no in-memory owner', async () => {
    await service.clearWorkplace('wp-a' as never, 'wp-a' as never);
    expect(nativeWidgets.clearWidgetData).toHaveBeenCalledTimes(1);
  });

  it('preserves a different recorded native owner when an inactive workplace is deleted', async () => {
    (storage.getString as jest.Mock).mockReturnValue('wp-b');
    service = new WidgetProjectionService();
    await service.clearWorkplace('wp-a' as never, 'wp-a' as never);
    expect(nativeWidgets.clearWidgetData).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'scoped owner cleanup',
      setup: () => {
        (storage.getAllKeys as jest.Mock).mockReturnValue(['widget_cleanup_owner_pending_v1_wp-a']);
        (storage.getString as jest.Mock).mockImplementation((key: string) =>
          key === 'widget_native_owner_v1' ? 'wp-b' : undefined,
        );
      },
      assert: async (service: WidgetProjectionService) => {
        await service.recoverPendingCleanup();
        expect(nativeWidgets.clearWidgetData).not.toHaveBeenCalled();
        expect(storage.remove).toHaveBeenCalledWith('widget_cleanup_owner_pending_v1_wp-a');
      },
    },
    {
      label: 'factory-reset marker',
      setup: () => {
        (storage.getBoolean as jest.Mock).mockReturnValue(true);
      },
      assert: async (service: WidgetProjectionService) => {
        await service.recoverPendingCleanup();
        expect(nativeWidgets.clearWidgetData).toHaveBeenCalledTimes(1);
      },
    },
  ])('recovers pending cleanup for $label', async ({ setup, assert }) => {
    setup();
    const service = new WidgetProjectionService();
    await assert(service);
  });

  it('falls back to an empty snapshot when the installed native bridge lacks clear support', async () => {
    (loadNativeWidgetAdapter as jest.Mock).mockResolvedValueOnce({
      syncWidgetData: nativeWidgets.syncWidgetData,
    });
    await service.clearAll();
    expect(nativeWidgets.syncWidgetData).toHaveBeenCalledWith({});
  });

  it('still attempts native clear when the recovery marker cannot be stored', async () => {
    (storage.set as jest.Mock).mockImplementationOnce(() => {
      throw new Error('marker storage unavailable');
    });
    await expect(service.clearAll()).rejects.toThrow('marker storage unavailable');
    expect(nativeWidgets.clearWidgetData).toHaveBeenCalledTimes(1);
  });

  it('restores the active workplace after a deferred deleted-workplace write completes', async () => {
    await service.begin('wp-b' as never).publish({ owner: 'b' } as never);
    let finishA!: () => void;
    nativeWidgets.syncWidgetData.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishA = resolve;
        }),
    );
    const publishingA = service.begin('wp-a' as never).publish({ owner: 'a' } as never);
    await flushUntilStarted(() => typeof finishA === 'function');
    const cleanupA = service.clearWorkplace('wp-a' as never, 'wp-b' as never);
    finishA();
    await publishingA;
    await cleanupA;
    expect(nativeWidgets.syncWidgetData).toHaveBeenLastCalledWith({ owner: 'b' });
    expect(nativeWidgets.clearWidgetData).not.toHaveBeenCalled();
  });

  it('invalidates an earlier lease when a newer workplace publication begins', async () => {
    const oldLease = service.begin('wp-a' as never);
    const newLease = service.begin('wp-b' as never);
    await oldLease.publish({ owner: 'a' } as never);
    await newLease.publish({ owner: 'b' } as never);
    expect(nativeWidgets.syncWidgetData).toHaveBeenCalledTimes(1);
    expect(nativeWidgets.syncWidgetData).toHaveBeenCalledWith({ owner: 'b' });
  });

  it('surfaces native cleanup rejection to the committed caller', async () => {
    const lease = service.begin('wp-a' as never);
    await lease.publish({ old: true } as never);
    nativeWidgets.clearWidgetData.mockRejectedValueOnce(new Error('native cleanup failed'));
    await expect(service.clearWorkplace('wp-a' as never, 'wp-a' as never)).rejects.toThrow(
      'native cleanup failed',
    );
    const nextLease = service.begin('wp-b' as never);
    await nextLease.publish({ next: true } as never);
    expect(nativeWidgets.clearWidgetData).toHaveBeenCalledTimes(2);
    expect(nativeWidgets.syncWidgetData).toHaveBeenLastCalledWith({ next: true });
  });

  it('publishes a new current snapshot even when the pending clear keeps failing', async () => {
    const stored = new Map<string, unknown>();
    (storage.set as jest.Mock).mockImplementation((key: string, value: unknown) =>
      stored.set(key, value),
    );
    (storage.remove as jest.Mock).mockImplementation((key: string) => stored.delete(key));
    (storage.getString as jest.Mock).mockImplementation((key: string) => {
      const value = stored.get(key);
      return typeof value === 'string' ? value : undefined;
    });
    (storage.getBoolean as jest.Mock).mockImplementation((key: string) => stored.get(key) === true);
    (storage.getAllKeys as jest.Mock).mockImplementation(() => [...stored.keys()]);
    nativeWidgets.clearWidgetData.mockRejectedValue(new Error('widget storage unavailable'));

    let finishA!: () => void;
    nativeWidgets.syncWidgetData.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishA = resolve;
        }),
    );
    const leaseA = service.begin('wp-a' as never);
    const publishingA = leaseA.publish({ owner: 'a' } as never);
    await flushUntilStarted(() => typeof finishA === 'function');
    const clearingA = service.clearWorkplace('wp-a' as never, 'wp-a' as never);
    finishA();
    await publishingA;
    await expect(clearingA).rejects.toThrow('widget storage unavailable');
    // The deleted workplace's in-flight write must not retire its own clear marker.
    expect(stored.get('widget_cleanup_owner_pending_v1_wp-a')).toBe(true);
    await expect(leaseA.publish({ stale: true } as never)).resolves.toBe(false);

    await service.begin('wp-b' as never).publish({ owner: 'b' } as never);
    expect(nativeWidgets.syncWidgetData).toHaveBeenLastCalledWith({ owner: 'b' });
    expect(stored.has('widget_cleanup_owner_pending_v1_wp-a')).toBe(false);
    expect(stored.get('widget_native_owner_v1')).toBe('wp-b');
    expect(logger.warn).toHaveBeenCalledTimes(1);

    const clearAttempts = nativeWidgets.clearWidgetData.mock.calls.length;
    await service.begin('wp-b' as never).publish({ owner: 'b', next: true } as never);
    expect(nativeWidgets.clearWidgetData).toHaveBeenCalledTimes(clearAttempts);
    expect(nativeWidgets.syncWidgetData).toHaveBeenLastCalledWith({ owner: 'b', next: true });
    expect(nativeWidgets.syncWidgetData).not.toHaveBeenCalledWith({ stale: true });
  });

  it('publishes after a failed factory-reset clear once a workplace resumes', async () => {
    nativeWidgets.clearWidgetData.mockRejectedValue(new Error('widget storage unavailable'));
    await expect(service.clearAll()).rejects.toThrow('widget storage unavailable');
    await expect(service.begin('wp-a' as never).publish({ old: true } as never)).resolves.toBe(
      false,
    );

    service.resumeWorkplace('wp-b' as never);
    await service.begin('wp-b' as never).publish({ owner: 'b' } as never);
    await service.begin('wp-b' as never).publish({ owner: 'b', next: true } as never);

    expect(nativeWidgets.clearWidgetData).toHaveBeenCalledTimes(2);
    expect(nativeWidgets.syncWidgetData).toHaveBeenLastCalledWith({ owner: 'b', next: true });
    expect(nativeWidgets.syncWidgetData).not.toHaveBeenCalledWith({ old: true });
    expect(storage.remove).toHaveBeenCalledWith('widget_cleanup_all_pending_v1');
  });
});
