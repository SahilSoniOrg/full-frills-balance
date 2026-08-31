import { WorkplaceId } from '@/src/types/ids';

/** State that belongs to this install and must not follow User or Workplace. */
export interface DevicePreferences {
  deviceRegistered: boolean;
  onboardingStage:
    'user_profile' | 'workplace_setup' | 'appearance' | 'review' | 'post_import' | 'complete';
  onboardingCompleted: boolean;
  isAppLockEnabled: boolean;
  anonymizedId?: string;
  activeWorkplaceId?: WorkplaceId;
  pendingWorkplaceId?: WorkplaceId;
  onboardingWorkplaceId?: WorkplaceId;
  isSmsImportEnabled: boolean;
}

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  deviceRegistered: false,
  onboardingStage: 'user_profile',
  onboardingCompleted: false,
  isAppLockEnabled: false,
  anonymizedId: undefined,
  activeWorkplaceId: undefined,
  pendingWorkplaceId: undefined,
  onboardingWorkplaceId: undefined,
  isSmsImportEnabled: false,
};

export const DEVICE_PREFERENCE_KEYS = [
  'deviceRegistered',
  'onboardingStage',
  'onboardingCompleted',
  'isAppLockEnabled',
  'anonymizedId',
  'activeWorkplaceId',
  'pendingWorkplaceId',
  'onboardingWorkplaceId',
  'isSmsImportEnabled',
] as const;

export type DevicePreferenceKey = (typeof DEVICE_PREFERENCE_KEYS)[number];

export const DEVICE_PREFERENCES_KEY = 'full_frills_balance_device_preferences';
