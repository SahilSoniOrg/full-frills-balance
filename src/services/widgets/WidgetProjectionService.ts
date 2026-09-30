import type { WidgetDataSnapshot } from '@/modules/expo-widgets/src/ExpoWidgets.types';
import type { WorkplaceId } from '@/src/types/ids';
import { loadNativeWidgetAdapter } from './nativeWidgetAdapter';
import { storage } from '@/src/utils/storage';

const WIDGET_CLEANUP_PENDING_ALL_KEY = 'widget_cleanup_all_pending_v1';
const WIDGET_CLEANUP_PENDING_OWNER_PREFIX = 'widget_cleanup_owner_pending_v1_';
const WIDGET_SYNC_PENDING_KEY = 'widget_sync_pending_owner_v1';
const WIDGET_NATIVE_OWNER_KEY = 'widget_native_owner_v1';

async function clearNativeWidgetData(
  nativeModule: Awaited<ReturnType<typeof loadNativeWidgetAdapter>>,
) {
  if (typeof nativeModule.clearWidgetData === 'function') {
    await nativeModule.clearWidgetData();
  } else {
    // Older native binaries may be paired with a newer JS bundle during an upgrade.
    await nativeModule.syncWidgetData({} as WidgetDataSnapshot);
  }
}

async function syncNativeWidgetData(
  nativeModule: Awaited<ReturnType<typeof loadNativeWidgetAdapter>>,
  workplaceId: WorkplaceId,
  snapshot: WidgetDataSnapshot,
): Promise<void> {
  storage.set(WIDGET_SYNC_PENDING_KEY, workplaceId);
  await nativeModule.syncWidgetData(snapshot);
  storage.set(WIDGET_NATIVE_OWNER_KEY, workplaceId);
  storage.remove(WIDGET_SYNC_PENDING_KEY);
}

export class WidgetProjectionService {
  private queue: Promise<void> = Promise.resolve();
  private globalEpoch = 0;
  private readonly workplaceEpochs = new Map<WorkplaceId, number>();
  private nativeOwner: WorkplaceId | null =
    (storage.getString(WIDGET_NATIVE_OWNER_KEY) as WorkplaceId | undefined) ?? null;
  private readonly retiredWorkplaces = new Set<WorkplaceId>();
  private resetBlocked = false;
  private pendingGlobalClear = false;
  private readonly pendingWorkplaceClears = new Set<WorkplaceId>();
  private readonly snapshots = new Map<WorkplaceId, WidgetDataSnapshot>();

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  resumeWorkplace(workplaceId: WorkplaceId): void {
    this.bumpWorkplaceEpoch(workplaceId);
    this.retiredWorkplaces.delete(workplaceId);
    this.resetBlocked = false;
  }

  begin(workplaceId: WorkplaceId) {
    this.globalEpoch += 1;
    const globalEpoch = this.globalEpoch;
    const workplaceEpoch = this.workplaceEpoch(workplaceId);
    const isCurrent = () =>
      globalEpoch === this.globalEpoch &&
      workplaceEpoch === this.workplaceEpoch(workplaceId) &&
      !this.resetBlocked &&
      !this.retiredWorkplaces.has(workplaceId);
    return {
      isCurrent,
      cancel: () => {
        if (isCurrent()) this.bumpWorkplaceEpoch(workplaceId);
      },
      publish: (snapshot: WidgetDataSnapshot) => {
        if (!isCurrent()) {
          return Promise.resolve(false);
        }
        this.snapshots.set(workplaceId, snapshot);
        return this.enqueue(async () => {
          await this.retryPendingCleanup();
          if (!isCurrent()) return;
          const nativeModule = await loadNativeWidgetAdapter();
          if (!isCurrent()) return;
          await syncNativeWidgetData(nativeModule, workplaceId, snapshot);
          // Native writes are uncancellable; reflect the actual last completed owner even
          // if a reset/deletion invalidated this request while it was in flight.
          this.nativeOwner = workplaceId;
        });
      },
    };
  }

  async clearWorkplace(workplaceId: WorkplaceId, activeWorkplaceId?: WorkplaceId): Promise<void> {
    this.snapshots.delete(workplaceId);
    this.retiredWorkplaces.add(workplaceId);
    this.bumpWorkplaceEpoch(workplaceId);
    const pendingKey = `${WIDGET_CLEANUP_PENDING_OWNER_PREFIX}${workplaceId}`;
    let markerFailure: unknown;
    try {
      storage.set(pendingKey, true);
    } catch (error) {
      this.pendingWorkplaceClears.add(workplaceId);
      markerFailure = error;
    }
    await this.enqueue(async () => {
      await this.clearNativeIfOwned(workplaceId, activeWorkplaceId);
      storage.remove(pendingKey);
    });
    if (markerFailure) throw markerFailure;
  }

  async clearAll(): Promise<void> {
    const knownWorkplaces = new Set(this.snapshots.keys());
    if (this.nativeOwner) knownWorkplaces.add(this.nativeOwner);
    this.snapshots.clear();
    this.resetBlocked = true;
    this.globalEpoch += 1;
    knownWorkplaces.forEach(workplaceId => this.retiredWorkplaces.add(workplaceId));
    let markerFailure: unknown;
    try {
      storage.set(WIDGET_CLEANUP_PENDING_ALL_KEY, true);
    } catch (error) {
      this.pendingGlobalClear = true;
      markerFailure = error;
    }
    try {
      await this.enqueue(async () => {
        const nativeModule = await loadNativeWidgetAdapter();
        await clearNativeWidgetData(nativeModule);
        this.nativeOwner = null;
        this.pendingGlobalClear = false;
        storage.remove(WIDGET_NATIVE_OWNER_KEY);
        storage.remove(WIDGET_SYNC_PENDING_KEY);
        storage.remove(WIDGET_CLEANUP_PENDING_ALL_KEY);
        this.removePendingMarkers();
      });
    } catch (error) {
      this.pendingGlobalClear = true;
      throw error;
    }
    if (markerFailure) throw markerFailure;
  }

  private async clearNativeIfOwned(
    workplaceId: WorkplaceId,
    activeWorkplaceId?: WorkplaceId,
  ): Promise<void> {
    // A single native widget slot is owned by the last completed publisher.
    // Clear it only when that slot still contains this deleted workplace.
    const forceClearActive = activeWorkplaceId === workplaceId && this.nativeOwner === null;
    if (this.nativeOwner !== workplaceId && !forceClearActive) {
      this.pendingWorkplaceClears.delete(workplaceId);
      return;
    }
    if (
      this.nativeOwner === workplaceId &&
      activeWorkplaceId &&
      activeWorkplaceId !== workplaceId
    ) {
      const activeSnapshot = this.snapshots.get(activeWorkplaceId);
      if (activeSnapshot) {
        const nativeModule = await loadNativeWidgetAdapter();
        await syncNativeWidgetData(nativeModule, activeWorkplaceId, activeSnapshot);
        this.nativeOwner = activeWorkplaceId;
        this.pendingWorkplaceClears.delete(workplaceId);
        return;
      }
    }
    try {
      const nativeModule = await loadNativeWidgetAdapter();
      await clearNativeWidgetData(nativeModule);
      this.nativeOwner = null;
      storage.remove(WIDGET_NATIVE_OWNER_KEY);
      this.pendingWorkplaceClears.delete(workplaceId);
    } catch (error) {
      this.pendingWorkplaceClears.add(workplaceId);
      throw error;
    }
  }

  private workplaceEpoch(workplaceId: WorkplaceId): number {
    return this.workplaceEpochs.get(workplaceId) ?? 0;
  }

  private bumpWorkplaceEpoch(workplaceId: WorkplaceId): void {
    this.workplaceEpochs.set(workplaceId, this.workplaceEpoch(workplaceId) + 1);
  }

  private async retryPendingCleanup(): Promise<void> {
    const hasPendingAll = storage.getBoolean(WIDGET_CLEANUP_PENDING_ALL_KEY) === true;
    const pendingKeys = storage
      .getAllKeys()
      .filter(key => key.startsWith(WIDGET_CLEANUP_PENDING_OWNER_PREFIX));
    const pendingSyncOwner = storage.getString(WIDGET_SYNC_PENDING_KEY);
    if (this.pendingGlobalClear || hasPendingAll || pendingSyncOwner) {
      const nativeModule = await loadNativeWidgetAdapter();
      await clearNativeWidgetData(nativeModule);
      this.nativeOwner = null;
      this.pendingGlobalClear = false;
      storage.remove(WIDGET_NATIVE_OWNER_KEY);
      storage.remove(WIDGET_SYNC_PENDING_KEY);
      storage.remove(WIDGET_CLEANUP_PENDING_ALL_KEY);
      storage.remove(WIDGET_CLEANUP_PENDING_ALL_KEY);
      this.removePendingMarkers();
      return;
    }
    for (const key of pendingKeys) {
      const workplaceId = key.slice(WIDGET_CLEANUP_PENDING_OWNER_PREFIX.length) as WorkplaceId;
      const recordedOwner = storage.getString(WIDGET_NATIVE_OWNER_KEY) as WorkplaceId | undefined;
      if (!recordedOwner || recordedOwner === workplaceId) {
        const nativeModule = await loadNativeWidgetAdapter();
        await clearNativeWidgetData(nativeModule);
        this.nativeOwner = null;
        storage.remove(WIDGET_NATIVE_OWNER_KEY);
      }
      storage.remove(key);
    }
    for (const workplaceId of [...this.pendingWorkplaceClears]) {
      await this.clearNativeIfOwned(workplaceId, undefined);
    }
  }

  private removePendingMarkers(): void {
    for (const key of storage.getAllKeys()) {
      if (key.startsWith(WIDGET_CLEANUP_PENDING_OWNER_PREFIX)) storage.remove(key);
    }
  }

  recoverPendingCleanup(): Promise<void> {
    return this.enqueue(() => this.retryPendingCleanup());
  }
}

export const widgetProjectionService = new WidgetProjectionService();
