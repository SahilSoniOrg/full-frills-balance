import { logger } from '@/src/utils/logger';
import { storage } from '../storage';
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

    // Before the preference split, onboardingCompleted was the install-level
    // claim flag. Seed the new launch gate from it when migrating the legacy
    // combined blob; an explicit new-format deviceRegistered value wins.
    const legacyDeviceRegistered =
      typeof device.deviceRegistered === 'boolean'
        ? device.deviceRegistered
        : typeof device.onboardingCompleted === 'boolean'
          ? device.onboardingCompleted
          : undefined;

    const userBlob: UIPreferences = { ...DEFAULT_UI_PREFERENCES, ...user };
    if (raw && storage.getString(USER_PREFERENCES_KEY) === undefined) {
      storage.set(USER_PREFERENCES_KEY, JSON.stringify({ ...userBlob, ...legacyCurrency }));
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
    promoteSmsListenFromWorkplaceBags();
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

/** Spec: if any Workplace had listen on, Device listen is on. Then drop the workplace key. */
function promoteSmsListenFromWorkplaceBags(): void {
  let listenOn = false;
  const workplaceKeysToClean: string[] = [];

  for (const key of storage.getAllKeys()) {
    if (!key.startsWith(WORKPLACE_PREFERENCES_KEY_PREFIX)) continue;
    const raw = storage.getString(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { isSmsImportEnabled?: boolean };
      if (typeof parsed !== 'object' || parsed === null) continue;
      if (parsed.isSmsImportEnabled === true) listenOn = true;
      if (!('isSmsImportEnabled' in parsed)) continue;
      workplaceKeysToClean.push(key);
    } catch {
      /* skip corrupt workplace bag */
    }
  }

  const rawDevice = storage.getString(DEVICE_PREFERENCES_KEY);
  const device = mergeDevicePreferences(rawDevice ? JSON.parse(rawDevice) : {});
  if (listenOn && !device.isSmsImportEnabled) {
    storage.set(DEVICE_PREFERENCES_KEY, JSON.stringify({ ...device, isSmsImportEnabled: true }));
  }
  for (const key of workplaceKeysToClean) {
    const parsed = JSON.parse(storage.getString(key) || '{}') as Record<string, unknown>;
    delete parsed.isSmsImportEnabled;
    storage.set(key, JSON.stringify(parsed));
  }
}

export { DEFAULT_DEVICE_PREFERENCES } from './deviceTypes';
