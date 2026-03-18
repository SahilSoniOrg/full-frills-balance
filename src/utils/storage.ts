import { createMMKV } from 'react-native-mmkv';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/src/utils/logger';

// Centralize MMKV instance with a specific ID for better isolation
export const storage = createMMKV({ id: 'full-frills-balance-storage' });

const MIGRATION_COMPLETE_KEY = 'mmkv_migration_complete_v1';

/**
 * Migration Bridge:
 * One-time migration from AsyncStorage to MMKV.
 * 
 * Robustness features:
 * 1. Idempotent: If it crashes midway, it resumes on next start.
 * 2. Non-destructive: Does not overwrite existing MMKV data if already present.
 * 3. Targeted: Only migrates keys relevant to this application.
 */
export async function migrateFromAsyncStorage(): Promise<boolean> {
  try {
    // 1. Check if migration was already done
    if (storage.getBoolean(MIGRATION_COMPLETE_KEY)) {
      return false;
    }

    logger.info('[Storage] Starting migration from AsyncStorage to MMKV...');

    // 2. Define targeted keys to migrate to minimize memory impact and noise
    const TARGET_KEYS = [
      'full_frills_balance_ui_preferences',
      'full_frills_balance_processed_sms_ids',
      '@integrity_schema_version'
    ];

    // 3. Get all keys or just targeted ones
    // We try to get all keys just in case, but prioritize our known ones.
    const allExistingKeys = await AsyncStorage.getAllKeys();
    
    if (allExistingKeys.length === 0) {
      logger.info('[Storage] No keys found in AsyncStorage. Marking migration as complete.');
      storage.set(MIGRATION_COMPLETE_KEY, true);
      return false;
    }

    // Combine targeted keys with any other found keys (limited to app namespace)
    const keysToMigrate = allExistingKeys.filter(key => 
      TARGET_KEYS.includes(key) || key.startsWith('full_frills_balance_')
    );

    if (keysToMigrate.length === 0) {
      storage.set(MIGRATION_COMPLETE_KEY, true);
      return false;
    }

    // 4. Batch read from AsyncStorage
    const pairs = await AsyncStorage.multiGet(keysToMigrate);

    // 5. Write to MMKV safely
    pairs.forEach(([key, value]) => {
      // Robustness: Only write if value exists AND we haven't already written a newer version to MMKV
      // in a previous partial attempt (though for the first migration this is unlikely)
      if (value !== null && !storage.contains(key)) {
        storage.set(key, value);
      }
    });

    // 6. Finalize migration
    storage.set(MIGRATION_COMPLETE_KEY, true);
    
    logger.info(`[Storage] Migration successful. Migrated ${pairs.length} keys.`);
    
    return true;
  } catch (error) {
    logger.error('[Storage] Migration from AsyncStorage failed', { error });
    // Note: We don't set MIGRATION_COMPLETE_KEY so it can retry on next launch
    return false;
  }
}
