import { logger } from '@/src/utils/logger';
import { storage } from '@/src/utils/storage';
import { DEVICE_PREFERENCES_KEY, DevicePreferences } from './deviceTypes';
import {
  hasDevicePreferenceValues,
  hasWorkplacePreferenceValues,
  mergeDevicePreferences,
  mergeWorkplacePreferences,
  splitPreferenceBags,
} from './splitPreferenceBags';
import {
  DEFAULT_UI_PREFERENCES,
  PREFERENCE_SPLIT_MIGRATION_KEY,
  PREFERENCES_KEY,
  UIPreferences,
  USER_PREFERENCES_KEY,
} from './types';
import { WORKPLACE_PREFERENCES_KEY_PREFIX, workplacePreferencesStorageKey } from './workplaceTypes';

/**
 * One-time split of the combined MMKV prefs blob into User, Device, and Workplace keys.
 * Also lifts workplace-scoped SMS listen onto Device (Device SMS listen).
 */
export function migrateLegacyPreferencesIfNeeded(): boolean {
  try {
    if (isPreferenceSplitMigrationComplete()) return true;

    const raw = storage.getString(PREFERENCES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    const { user, device, workplace, legacyCurrency } = splitPreferenceBags(parsed);
    const legacyRecord =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};

    // Before the preference split, onboardingCompleted was the install-level
    // claim flag. Seed the new launch gate from it when migrating the legacy
    // combined blob; an explicit new-format deviceRegistered value wins.
    const legacyDeviceRegistered =
      typeof device.deviceRegistered === 'boolean'
        ? device.deviceRegistered
        : typeof legacyRecord.onboardingCompleted === 'boolean'
          ? legacyRecord.onboardingCompleted
          : undefined;

    const userBlob: UIPreferences = { ...DEFAULT_UI_PREFERENCES, ...user };
    const existingUserRaw = storage.getString(USER_PREFERENCES_KEY);
    if (raw && existingUserRaw === undefined) {
      // Keep legacy currency available until WorkplaceService can apply it to
      // the migrated Workplace rows and acknowledge the migration.
      storage.set(USER_PREFERENCES_KEY, JSON.stringify({ ...userBlob, ...legacyCurrency }));
    } else if (raw && existingUserRaw && Object.keys(legacyCurrency).length > 0) {
      // A previous attempt may have created the User bag before failing. Do
      // not lose legacy currency just because that partial bag already exists.
      try {
        const existingUser = JSON.parse(existingUserRaw);
        if (
          typeof existingUser === 'object' &&
          existingUser !== null &&
          !Array.isArray(existingUser)
        ) {
          const mergedUser = { ...(existingUser as Record<string, unknown>) };
          let changed = false;
          for (const [key, value] of Object.entries(legacyCurrency)) {
            if (key in mergedUser) continue;
            mergedUser[key] = value;
            changed = true;
          }
          if (changed) storage.set(USER_PREFERENCES_KEY, JSON.stringify(mergedUser));
        }
      } catch {
        // The canonical User bag will be recovered from the legacy blob below.
      }
    }

    const deviceKeyExists = storage.getString(DEVICE_PREFERENCES_KEY) !== undefined;
    const deviceBlob: DevicePreferences = mergeDevicePreferences({
      ...device,
      ...(legacyDeviceRegistered !== undefined ? { deviceRegistered: legacyDeviceRegistered } : {}),
    });
    if (hasDevicePreferenceValues(device) || !deviceKeyExists) {
      storage.set(DEVICE_PREFERENCES_KEY, JSON.stringify(deviceBlob));
    }

    if (deviceBlob.activeWorkplaceId && hasWorkplacePreferenceValues(workplace)) {
      const workplaceKey = workplacePreferencesStorageKey(deviceBlob.activeWorkplaceId);
      if (storage.getString(workplaceKey) === undefined) {
        storage.set(workplaceKey, JSON.stringify(mergeWorkplacePreferences(workplace)));
      }
    }

    if (raw) storage.set(PREFERENCES_KEY, JSON.stringify(userBlob));
    stripLegacySmsListenFromWorkplaceBags();
    storage.set(PREFERENCE_SPLIT_MIGRATION_KEY, 'complete');
    return true;
  } catch (error) {
    logger.error('Failed to migrate combined preferences into User/Device/Workplace bags', {
      error,
    });
    return false;
  }
}

export function isPreferenceSplitMigrationComplete(): boolean {
  return storage.getString(PREFERENCE_SPLIT_MIGRATION_KEY) === 'complete';
}

/** Read Device-bag presence before migration can synthesize a default bag. */
export function hasRawDeviceBag(rawDeviceBag = storage.getString(DEVICE_PREFERENCES_KEY)): boolean {
  return rawDeviceBag !== undefined;
}

/** Strip legacy workplace SMS listen keys left from pre-split preference bags. */
function stripLegacySmsListenFromWorkplaceBags(): void {
  for (const key of storage.getAllKeys()) {
    if (!key.startsWith(WORKPLACE_PREFERENCES_KEY_PREFIX)) continue;
    const raw = storage.getString(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { isSmsImportEnabled?: boolean };
      if (typeof parsed !== 'object' || parsed === null) continue;
      if (!('isSmsImportEnabled' in parsed)) continue;
      delete parsed.isSmsImportEnabled;
      storage.set(key, JSON.stringify(parsed));
    } catch {
      /* skip corrupt workplace bag */
    }
  }
}

export { DEFAULT_DEVICE_PREFERENCES } from './deviceTypes';
