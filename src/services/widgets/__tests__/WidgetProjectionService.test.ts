import { WidgetProjectionService } from '../WidgetProjectionService';
import { loadNativeWidgetAdapter } from '../nativeWidgetAdapter';
import { storage } from '@/src/utils/storage';

async function flushUntilStarted(started: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20 && !started(); attempt += 1) await Promise.resolve();
  if (!started()) throw new Error('Expected native widget operation to start');
}

const nativeWidgets = {
  syncWidgetData: jest.fn<Promise<void>, [unknown]>(),
  clearWidgetData: jest.fn<Promise<void>, []>(),
};

jest.mock('../nativeWidgetAdapter', () => ({
  loadNativeWidgetAdapter: jest.fn(),
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

  it('retries a scoped pending cleanup without clearing a newer owner', async () => {
    (storage.getAllKeys as jest.Mock).mockReturnValue(['widget_cleanup_owner_pending_v1_wp-a']);
    (storage.getString as jest.Mock).mockImplementation((key: string) =>
      key === 'widget_native_owner_v1' ? 'wp-b' : undefined,
    );
    service = new WidgetProjectionService();
    await service.recoverPendingCleanup();
    expect(nativeWidgets.clearWidgetData).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith('widget_cleanup_owner_pending_v1_wp-a');
  });

  it('recovers a pending factory-reset clear without a workplace publication', async () => {
    (storage.getBoolean as jest.Mock).mockReturnValue(true);
    service = new WidgetProjectionService();
    await service.recoverPendingCleanup();
    expect(nativeWidgets.clearWidgetData).toHaveBeenCalledTimes(1);
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
});
