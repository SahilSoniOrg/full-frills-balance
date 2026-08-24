import { AppConfig } from '@/src/constants/app-config';
import { schema } from '@/src/data/database/schema';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
export const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
export const BUILD_TYPE = process.env.APP_VARIANT || 'development';

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
      $app_variant: process.env.EXPO_PUBLIC_APP_VARIANT || 'production',
      $build_type: BUILD_TYPE || 'unknown',
      $active_workplace_id: preferences.activeWorkplaceId || 'none',
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
