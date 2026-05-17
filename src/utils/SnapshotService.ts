import { logger } from '@/src/utils/logger';
import { storage } from './storage';

const DASHBOARD_SNAPSHOT_KEY = 'dashboard_data_snapshot';
const WEALTH_SNAPSHOT_KEY = 'wealth_summary_snapshot';

/**
 * SnapshotService - Manages persistent JSON snapshots for "Instant Boot".
 * Uses MMKV for synchronous, high-performance disk access.
 */
class SnapshotService {
  /**
   * Helper to handle Map serialization and WatermelonDB Model sanitization during JSON.stringify.
   */
  private replacer(_key: string, value: any): any {
    // Handle WatermelonDB Models (they have a private _raw property or public raw getter)
    // We only want the data, not the database instance/observables which cause circularity.
    if (value && typeof value === 'object') {
      if (value._raw && typeof value._raw === 'object') {
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
  private reviver(_key: string, value: any): any {
    if (typeof value === 'object' && value !== null) {
      if (value.dataType === 'Map') {
        return new Map(value.value);
      }
      if (value.dataType === 'Set') {
        return new Set(value.value);
      }
    }
    return value;
  }

  /**
   * Persists a dashboard snapshot to disk.
   */
  saveDashboardSnapshot(data: any): void {
    try {
      storage.set(DASHBOARD_SNAPSHOT_KEY, JSON.stringify(data, this.replacer));
    } catch (error) {
      logger.error('[SnapshotService] Failed to save dashboard snapshot', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Retrieves the last saved dashboard snapshot.
   */
  getDashboardSnapshot(): any | null {
    try {
      const stored = storage.getString(DASHBOARD_SNAPSHOT_KEY);
      if (!stored) return null;
      return JSON.parse(stored, this.reviver);
    } catch (error) {
      logger.error('[SnapshotService] Failed to load dashboard snapshot', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Persists a wealth summary snapshot.
   */
  saveWealthSnapshot(data: any): void {
    try {
      storage.set(WEALTH_SNAPSHOT_KEY, JSON.stringify(data, this.replacer));
    } catch (error) {
      logger.error('[SnapshotService] Failed to save wealth snapshot', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Retrieves the last saved wealth summary.
   */
  getWealthSnapshot(): any | null {
    try {
      const stored = storage.getString(WEALTH_SNAPSHOT_KEY);
      if (!stored) return null;
      return JSON.parse(stored, this.reviver);
    } catch (error) {
      logger.error('[SnapshotService] Failed to load wealth snapshot', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Persists a custom snapshot by key.
   */
  saveCustomSnapshot(key: string, data: any): void {
    try {
      storage.set(key, JSON.stringify(data, this.replacer));
    } catch (error) {
      logger.error(`[SnapshotService] Failed to save snapshot: ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Retrieves a custom snapshot by key.
   */
  getCustomSnapshot(key: string): any | null {
    try {
      const stored = storage.getString(key);
      if (!stored) return null;
      return JSON.parse(stored, this.reviver);
    } catch (error) {
      logger.error(`[SnapshotService] Failed to load snapshot: ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Clears all snapshots (e.g., on logout or workplace switch).
   */
  clearSnapshots(): void {
    try {
      storage.remove(DASHBOARD_SNAPSHOT_KEY);
      storage.remove(WEALTH_SNAPSHOT_KEY);
    } catch (error) {
      logger.warn('[SnapshotService] Failed to clear snapshots', { error });
    }
  }
}

export const snapshotService = new SnapshotService();
