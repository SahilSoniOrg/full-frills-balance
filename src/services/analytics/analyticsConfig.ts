import { AppConfig } from '@/src/constants/app-config';
import { readAppVariant } from './appVariant';
import { schema } from '@/src/data/database/schema';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/services/preferences';
import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { sanitizeGlobalAnalyticsProperties } from '@/src/utils/observabilityPrivacy';

export const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
export const BUILD_TYPE = readAppVariant();
const variantSentryDsn =
  BUILD_TYPE === 'development'
    ? process.env.EXPO_PUBLIC_SENTRY_DSN_DEVELOPMENT
    : BUILD_TYPE === 'preview'
      ? process.env.EXPO_PUBLIC_SENTRY_DSN_PREVIEW
      : process.env.EXPO_PUBLIC_SENTRY_DSN_PRODUCTION;
// PostHog uses one project across build variants; segment with app_variant/build_type properties.
export const RESOLVED_POSTHOG_API_KEY = POSTHOG_API_KEY;
export const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';
export const SENTRY_DSN = variantSentryDsn || process.env.EXPO_PUBLIC_SENTRY_DSN || '';
export const SENTRY_RELEASE = `in.sahilsoni.fullfrillsbalance@${Application.nativeApplicationVersion || AppConfig.appVersion}+${Application.nativeBuildVersion || '1'}`;
export const SENTRY_DIST = Application.nativeBuildVersion || '1';

export type AnalyticsProperty =
  | string
  | number
  | boolean
  | null
  | undefined
  | AnalyticsProperty[]
  | { [key: string]: AnalyticsProperty };
export type AnalyticsProperties = Record<string, AnalyticsProperty>;

export const navigationIntegration = Sentry.reactNavigationIntegration();

/**
 * Get global properties for event enrichment
 */
export function getGlobalProperties(): AnalyticsProperties {
  try {
    return {
      $app_id: Application.applicationId || 'unknown',
      $app_namespace: Application.applicationId || 'unknown',
      $app_name: Application.applicationName || 'Full Frills Balance',
      $app_version: Application.nativeApplicationVersion || AppConfig.appVersion,
      $app_build: Application.nativeBuildVersion || '1',
      $app_build_number: Application.nativeBuildVersion || '1',
      $device_name: Device.deviceName || 'unknown',
      $device_model: Device.modelName || 'unknown',
      $os_name: Platform.OS,
      $os_version: Device.osVersion || 'unknown',
      $is_tablet: Device.deviceType === Device.DeviceType.TABLET,
      $is_dev: __DEV__ || !Device.isDevice,
      $app_variant: readAppVariant(),
      $build_type: BUILD_TYPE,
      $active_workplace_id: preferences.device.activeWorkplaceId || 'none',
      $db_schema_version: schema.version,
      is_test_build: BUILD_TYPE !== 'production',
    };
  } catch (error) {
    logger.warn('[Analytics] Failed to collect some global properties', { error });
    return {
      $os_name: Platform.OS,
      $is_dev: __DEV__,
      $build_type: BUILD_TYPE || 'unknown',
    };
  }
}

/** Safe install and runtime context sent specifically with PostHog flag evaluations. */
export function getFeatureFlagProperties(
  distinctId: string,
): Record<string, string | number | boolean> {
  const globalProperties = sanitizeGlobalAnalyticsProperties(getGlobalProperties());
  const propertyKeys = [
    '$app_version',
    '$app_build',
    '$app_build_number',
    '$os_name',
    '$os_version',
    '$is_tablet',
    '$is_dev',
    '$app_variant',
    '$build_type',
    '$db_schema_version',
    'is_test_build',
  ] as const;
  const properties: Record<string, string | number | boolean> = {};
  for (const key of propertyKeys) {
    const value = globalProperties[key];
    if (value !== undefined) properties[key] = value;
  }

  const nativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';
  const deviceTypes: Record<number, string> = {
    [Device.DeviceType.UNKNOWN]: 'unknown',
    [Device.DeviceType.PHONE]: 'phone',
    [Device.DeviceType.TABLET]: 'tablet',
    [Device.DeviceType.DESKTOP]: 'desktop',
    [Device.DeviceType.TV]: 'tv',
  };
  const updateChannel = Updates.channel;
  const identityKind = distinctId.match(/^(anon|dev|preview|e2e|sim)_/)?.[1];

  properties.platform = Platform.OS;
  properties.device_type = nativePlatform
    ? (deviceTypes[Device.deviceType ?? Device.DeviceType.UNKNOWN] ?? 'unknown')
    : Platform.OS === 'web'
      ? 'web'
      : 'unknown';
  properties.$os_version = properties.$os_version || Device.osVersion || 'unknown';
  properties.is_emulator = nativePlatform && Device.isDevice === false;
  properties.install_kind = identityKind ?? 'unknown';
  properties.update_channel =
    typeof updateChannel === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(updateChannel)
      ? updateChannel
      : 'none';

  const deviceModel = Device.modelName;
  if (typeof deviceModel === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ._()+/-]{0,79}$/.test(deviceModel))
    properties.device_model = deviceModel;
  else properties.device_model = 'unknown';

  return properties;
}
