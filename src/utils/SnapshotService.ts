import type { PetState } from '@/src/services/FinancialPetService';
import type { StreakResult } from '@/src/services/StreakService';
import { WIDGET_KEYS } from '@/modules/expo-widgets/src/ExpoWidgetsKeys';
import { logger } from '@/src/utils/logger';
import { storage } from './storage';

const DASHBOARD_SNAPSHOT_KEY = 'dashboard_data_snapshot';
const WEALTH_SNAPSHOT_KEY = 'wealth_summary_snapshot';
export const FINANCIAL_PET_SNAPSHOT_KEY = 'financial_pet_snapshot';
export const STREAK_SNAPSHOT_KEY = 'streak_snapshot';

/**
 * AppGroup identifier for shared native widget data synchronization (iOS / Android shared storage).
 * Coordinated with T-003 spec seam and WIDGET_KEYS contract.
 */
export const APP_GROUP_ID = WIDGET_KEYS.APP_GROUP_ID;

// 2 days TTL for snapshots to ensure they don't get too stale
const SNAPSHOT_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

export interface Snapshot<T> {
  data: T;
  timestamp: number;
  workplaceId: string;
}

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
  saveDashboardSnapshot(workplaceId: string, data: any): void {
    try {
      const snapshot: Snapshot<any> = {
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
  getDashboardSnapshot(workplaceId: string): any | null {
    return this.getValidatedSnapshot(`${DASHBOARD_SNAPSHOT_KEY}_${workplaceId}`, workplaceId);
  }

  /**
   * Persists a wealth summary snapshot.
   */
  saveWealthSnapshot(workplaceId: string, data: any): void {
    try {
      const snapshot: Snapshot<any> = {
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
  getWealthSnapshot(workplaceId: string): any | null {
    return this.getValidatedSnapshot(`${WEALTH_SNAPSHOT_KEY}_${workplaceId}`, workplaceId);
  }

  /**
   * Persists a custom snapshot by key.
   */
  saveCustomSnapshot(workplaceId: string, key: string, data: any): void {
    try {
      const snapshot: Snapshot<any> = {
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
  getCustomSnapshot(workplaceId: string, key: string): any | null {
    return this.getValidatedSnapshot(`${key}_${workplaceId}`, workplaceId);
  }

  /**
   * Persists financial pet state snapshot to MMKV for fast boot and shared widget seam.
   */
  saveFinancialPetSnapshot(workplaceId: string, data: PetState): void {
    this.saveCustomSnapshot(workplaceId, FINANCIAL_PET_SNAPSHOT_KEY, data);
  }

  /**
   * Retrieves the last saved financial pet snapshot for a workplace.
   */
  getFinancialPetSnapshot(workplaceId: string): PetState | null {
    return this.getCustomSnapshot(workplaceId, FINANCIAL_PET_SNAPSHOT_KEY);
  }

  /**
   * Persists streak state snapshot to MMKV for fast boot and shared widget seam.
   */
  saveStreakSnapshot(workplaceId: string, data: StreakResult): void {
    this.saveCustomSnapshot(workplaceId, STREAK_SNAPSHOT_KEY, data);
  }

  /**
   * Retrieves the last saved streak snapshot for a workplace.
   */
  getStreakSnapshot(workplaceId: string): StreakResult | null {
    return this.getCustomSnapshot(workplaceId, STREAK_SNAPSHOT_KEY);
  }

  /**
   * Internal helper to validate snapshot workplace and age.
   */
  private getValidatedSnapshot(key: string, workplaceId: string): any | null {
    try {
      const stored = storage.getString(key);
      if (!stored) return null;

      const snapshot = JSON.parse(stored, this.reviver) as Snapshot<any>;

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
   * Clears all snapshots.
   */
  clearSnapshots(): void {
    try {
      // Note: This is now slightly more complex because of workplace-prefixed keys.
      // For now, we clear the standard keys if they exist, but a full clear
      // might need to iterate keys (MMKV.getAllKeys())
      storage.clearAll();
    } catch (error) {
      logger.warn('[SnapshotService] Failed to clear snapshots', { error });
    }
  }
}

export const snapshotService = new SnapshotService();
