import { WorkplaceId } from '@/src/types/ids';

/** State that belongs to this install and must not follow User or Workplace. */
export interface DevicePreferences {
  deviceRegistered: boolean;
  isAppLockEnabled: boolean;
  anonymizedId?: string;
  activeWorkplaceId?: WorkplaceId;
  isSmsImportEnabled: boolean;
}

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  deviceRegistered: false,
  isAppLockEnabled: false,
  anonymizedId: undefined,
  activeWorkplaceId: undefined,
  isSmsImportEnabled: false,
};

export const DEVICE_PREFERENCE_KEYS = [
  'deviceRegistered',
  'isAppLockEnabled',
  'anonymizedId',
  'activeWorkplaceId',
  'isSmsImportEnabled',
] as const;

export type DevicePreferenceKey = (typeof DEVICE_PREFERENCE_KEYS)[number];

export const DEVICE_PREFERENCES_KEY = 'full_frills_balance_device_preferences';
