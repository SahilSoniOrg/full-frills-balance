import { logger } from '@/src/utils/logger';
import { storage } from './storage';

const DASHBOARD_SNAPSHOT_KEY = 'dashboard_data_snapshot';
const WEALTH_SNAPSHOT_KEY = 'wealth_summary_snapshot';

// 2 days TTL for snapshots to ensure they don't get too stale
const SNAPSHOT_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

export interface Snapshot<T = unknown> {
  data: T;
  timestamp: number;
  workplaceId: string;
}

/**
 * SnapshotService - Manages persistent JSON snapshots for "Instant Boot".
 * Uses MMKV for synchronous, high-performance disk access.
 */
class SnapshotService {
  private readonly pendingWrites = new Map<string, () => void>();
  private pendingWriteTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Reactive consumers can observe the same logical value through more than
   * one replay path. Keep the last serialized payload so those emissions do
   * not rewrite MMKV synchronously without changing snapshot freshness or
   * cold-boot behavior.
   */
  private readonly lastPersistedPayloads = new Map<string, string>();

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  /**
   * Helper to handle Map serialization and WatermelonDB Model sanitization during JSON.stringify.
   */
  private replacer(_key: string, value: unknown): unknown {
    // Handle WatermelonDB Models (they have a private _raw property or public raw getter)
    // We only want the data, not the database instance/observables which cause circularity.
    if (SnapshotService.isRecord(value)) {
      if (SnapshotService.isRecord(value._raw)) {
        return value._raw;
      }
      if (value.asOfDate && value.accountId && value.balance !== undefined) {
        // Handle AccountBalance-like structures if they contain models
        return value;
      }
    }

    if (value instanceof Map) {
      return {
        dataType: 'Map',
        value: Array.from(value.entries()),
      };
    }

    if (value instanceof Set) {
      return {
        dataType: 'Set',
        value: Array.from(value.values()),
      };
    }

    return value;
  }

  /**
   * Helper to handle Map/Set deserialization during JSON.parse
   */
  private reviver(_key: string, value: unknown): unknown {
    if (SnapshotService.isRecord(value)) {
      if (value.dataType === 'Map' && Array.isArray(value.value)) {
        return new Map(value.value);
      }
      if (value.dataType === 'Set' && Array.isArray(value.value)) {
        return new Set(value.value);
      }
    }
    return value;
  }

  /**
   * Persists a dashboard snapshot to disk.
   */
  saveDashboardSnapshot<T>(workplaceId: string, data: T): void {
    this.saveSnapshot(`${DASHBOARD_SNAPSHOT_KEY}_${workplaceId}`, workplaceId, data, 'dashboard');
  }

  /**
   * Retrieves the last saved dashboard snapshot for a specific workplace.
   * Includes TTL validation (max 2 days old).
   */
  getDashboardSnapshot<T = unknown>(workplaceId: string): T | null {
    return this.getValidatedSnapshot<T>(`${DASHBOARD_SNAPSHOT_KEY}_${workplaceId}`, workplaceId);
  }

  /**
   * Persists a wealth summary snapshot.
   */
  saveWealthSnapshot<T>(workplaceId: string, data: T): void {
    this.saveSnapshot(`${WEALTH_SNAPSHOT_KEY}_${workplaceId}`, workplaceId, data, 'wealth');
  }

  /**
   * Retrieves the last saved wealth summary for a specific workplace.
   */
  getWealthSnapshot<T = unknown>(workplaceId: string): T | null {
    return this.getValidatedSnapshot<T>(`${WEALTH_SNAPSHOT_KEY}_${workplaceId}`, workplaceId);
  }

  /**
   * Persists a custom snapshot by key.
   */
  saveCustomSnapshot<T>(workplaceId: string, key: string, data: T): void {
    this.saveSnapshot(`${key}_${workplaceId}`, workplaceId, data, key);
  }

  private saveSnapshot<T>(storageKey: string, workplaceId: string, data: T, label: string): void {
    try {
      const payload = JSON.stringify(data, this.replacer) ?? 'undefined';

      // A storage read protects correctness if snapshots were cleared outside
      // this instance (for example during logout or a test reset).
      if (this.lastPersistedPayloads.get(storageKey) === payload && storage.getString(storageKey)) {
        return;
      }

      const snapshot: Snapshot<T> = {
        data,
        timestamp: Date.now(),
        workplaceId,
      };
      storage.set(storageKey, JSON.stringify(snapshot, this.replacer));
      this.lastPersistedPayloads.set(storageKey, payload);
    } catch (error) {
      logger.error(`[SnapshotService] Failed to save snapshot: ${label}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private deferWrite(key: string, write: () => void): void {
    this.pendingWrites.set(key, write);
    if (this.pendingWriteTimer !== null) return;
    this.pendingWriteTimer = setTimeout(() => {
      this.pendingWriteTimer = null;
      const writes = Array.from(this.pendingWrites.values());
      this.pendingWrites.clear();
      for (const pendingWrite of writes) pendingWrite();
    }, 0);
  }

  deferDashboardSnapshot<T>(workplaceId: string, data: T): void {
    this.deferWrite(`${DASHBOARD_SNAPSHOT_KEY}_${workplaceId}`, () =>
      this.saveDashboardSnapshot(workplaceId, data),
    );
  }

  deferWealthSnapshot<T>(workplaceId: string, data: T): void {
    this.deferWrite(`${WEALTH_SNAPSHOT_KEY}_${workplaceId}`, () =>
      this.saveWealthSnapshot(workplaceId, data),
    );
  }

  deferCustomSnapshot<T>(workplaceId: string, key: string, data: T): void {
    this.deferWrite(`${key}_${workplaceId}`, () => this.saveCustomSnapshot(workplaceId, key, data));
  }

  /**
   * Retrieves a custom snapshot by key.
   */
  getCustomSnapshot<T = unknown>(workplaceId: string, key: string): T | null {
    return this.getValidatedSnapshot<T>(`${key}_${workplaceId}`, workplaceId);
  }

  /**
   * Internal helper to validate snapshot workplace and age.
   */
  private getValidatedSnapshot<T>(key: string, workplaceId: string): T | null {
    try {
      const stored = storage.getString(key);
      if (!stored) return null;

      const snapshot = JSON.parse(stored, this.reviver) as Snapshot<T>;

      // 1. Workplace Isolation Check (Prevent Data Leaks)
      if (snapshot.workplaceId !== workplaceId) {
        logger.warn(`[SnapshotService] Workplace mismatch for key ${key}. Deleting stale cache.`);
        storage.remove(key);
        return null;
      }

      // 2. TTL Validation (2 Days)
      const age = Date.now() - snapshot.timestamp;
      if (age > SNAPSHOT_MAX_AGE_MS) {
        logger.info(
          `[SnapshotService] Snapshot for ${key} expired (${Math.round(age / 3600000)}h old).`,
        );
        storage.remove(key);
        return null;
      }

      return snapshot.data;
    } catch (error) {
      logger.error(`[SnapshotService] Failed to load snapshot: ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Clears all snapshot records selectively without wiping non-snapshot storage keys.
   */
  clearSnapshots(): void {
    if (this.pendingWriteTimer !== null) {
      clearTimeout(this.pendingWriteTimer);
      this.pendingWriteTimer = null;
    }
    this.pendingWrites.clear();
    try {
      const keys = storage.getAllKeys();
      for (const key of keys) {
        if (
          key.startsWith(DASHBOARD_SNAPSHOT_KEY) ||
          key.startsWith(WEALTH_SNAPSHOT_KEY) ||
          key.includes('_snapshot_')
        ) {
          storage.remove(key);
        }
      }
      this.lastPersistedPayloads.clear();
    } catch (error) {
      logger.warn('[SnapshotService] Failed to clear snapshots', { error });
    }
  }

  /** Clears persisted and queued snapshots for one workplace after a full data replacement. */
  clearSnapshotsForWorkplace(workplaceId: string): void {
    const suffix = `_${workplaceId}`;
    for (const key of this.pendingWrites.keys()) {
      if (key.endsWith(suffix)) this.pendingWrites.delete(key);
    }

    try {
      const keys = storage.getAllKeys();
      for (const key of keys) {
        const stored = storage.getString(key);
        if (!stored) continue;

        try {
          const snapshot = JSON.parse(stored) as Partial<Snapshot>;
          if (
            snapshot.workplaceId === workplaceId &&
            typeof snapshot.timestamp === 'number' &&
            'data' in snapshot
          ) {
            storage.remove(key);
            this.lastPersistedPayloads.delete(key);
          }
        } catch {
          // Ignore unrelated non-JSON storage entries.
        }
      }
    } catch (error) {
      logger.warn('[SnapshotService] Failed to clear workplace snapshots', { error });
    }
  }
}

export const snapshotService = new SnapshotService();
