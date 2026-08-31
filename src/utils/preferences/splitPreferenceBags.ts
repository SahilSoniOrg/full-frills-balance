import {
  DEFAULT_DEVICE_PREFERENCES,
  DEVICE_PREFERENCE_KEYS,
  DevicePreferences,
} from './deviceTypes';
import { LEGACY_PREFERENCE_KEYS, UIPreferences, USER_PREFERENCE_KEYS } from './types';
import {
  DEFAULT_WORKPLACE_PREFERENCES,
  WORKPLACE_PREFERENCE_KEYS,
  WorkplacePreferences,
} from './workplaceTypes';

export type SplitPreferenceBags = {
  user: Partial<UIPreferences>;
  device: Partial<DevicePreferences>;
  workplace: Partial<WorkplacePreferences>;
  legacyCurrency: Record<string, unknown>;
};

function pickKeys<T>(record: Record<string, unknown>, keys: readonly string[]): Partial<T> {
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in record) picked[key] = record[key];
  }
  return picked as Partial<T>;
}

/** Split a legacy combined prefs blob (or an import payload) into the three tenancy bags. */
export function splitPreferenceBags(data: unknown): SplitPreferenceBags {
  const record =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  const legacyCurrency: Record<string, unknown> = {};
  for (const key of LEGACY_PREFERENCE_KEYS) {
    if (key in record) legacyCurrency[key] = record[key];
  }

  return {
    user: pickKeys<UIPreferences>(record, USER_PREFERENCE_KEYS),
    device: pickKeys<DevicePreferences>(record, DEVICE_PREFERENCE_KEYS),
    workplace: pickKeys<WorkplacePreferences>(record, WORKPLACE_PREFERENCE_KEYS),
    legacyCurrency,
  };
}

export function hasWorkplacePreferenceValues(workplace: Partial<WorkplacePreferences>): boolean {
  return WORKPLACE_PREFERENCE_KEYS.some(key => key in workplace);
}

export function hasDevicePreferenceValues(device: Partial<DevicePreferences>): boolean {
  return DEVICE_PREFERENCE_KEYS.some(key => key in device);
}

export function mergeWorkplacePreferences(
  patch: Partial<WorkplacePreferences>,
): WorkplacePreferences {
  return { ...DEFAULT_WORKPLACE_PREFERENCES, ...patch };
}

export function mergeDevicePreferences(patch: Partial<DevicePreferences>): DevicePreferences {
  return { ...DEFAULT_DEVICE_PREFERENCES, ...patch };
}
