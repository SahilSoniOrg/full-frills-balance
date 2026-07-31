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
    try {
      const snapshot: Snapshot<T> = {
        data,
        timestamp: Date.now(),
        workplaceId,
      };
      storage.set(
        `${DASHBOARD_SNAPSHOT_KEY}_${workplaceId}`,
        JSON.stringify(snapshot, this.replacer),
      );
    } catch (error) {
      logger.error('[SnapshotService] Failed to save dashboard snapshot', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    try {
      const snapshot: Snapshot<T> = {
        data,
        timestamp: Date.now(),
        workplaceId,
      };
      storage.set(`${WEALTH_SNAPSHOT_KEY}_${workplaceId}`, JSON.stringify(snapshot, this.replacer));
    } catch (error) {
      logger.error('[SnapshotService] Failed to save wealth snapshot', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    try {
      const snapshot: Snapshot<T> = {
        data,
        timestamp: Date.now(),
        workplaceId,
      };
      storage.set(`${key}_${workplaceId}`, JSON.stringify(snapshot, this.replacer));
    } catch (error) {
      logger.error(`[SnapshotService] Failed to save snapshot: ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    } catch (error) {
      logger.warn('[SnapshotService] Failed to clear snapshots', { error });
    }
  }
}

export const snapshotService = new SnapshotService();
