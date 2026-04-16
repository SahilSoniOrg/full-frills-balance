import { AppConfig } from '@/src/constants/app-config';
import { ImportStats } from '@/src/services/import';
import { logger } from '@/src/utils/logger';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import PostHog from 'posthog-react-native';
import { Platform } from 'react-native';

/**
 * Analytics Service
 *
 * Provides a privacy-first, lightweight wrapper for tracking usage patterns.
 * Powered by PostHog.
 */

export const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
export const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
const BUILD_TYPE = process.env.APP_VARIANT || 'development'; // 'development', 'preview', 'production'

export class AnalyticsService {
  private _posthog: PostHog | null = null;
  private sessionStartTime: number = Date.now();
  private sessionTimeoutTimer: NodeJS.Timeout | null = null;

  public get posthog(): PostHog | null {
    return this._posthog;
  }

  constructor() {
    // Constructor remains lightweight to avoid module evaluation delays
  }

  /**
   * Initialize analytics provider.
   */
  initialize() {
    // 1. Setup PostHog instance on-demand
    if (!this._posthog && POSTHOG_API_KEY) {
      try {
        this._posthog = new PostHog(POSTHOG_API_KEY, {
          host: POSTHOG_HOST,
          disabled: __DEV__,
        });
      } catch (error) {
        logger.error('[Analytics] Failed to create PostHog instance', error);
      }
    }

    // 2. Register as the performance reporter for the logger metric layer
    logger.setPerformanceReporter((metric, value, context) => {
      this.trackPerformance(metric, value, context);
    });

    if (this._posthog && __DEV__) {
      logger.info('[Analytics] PostHog client ready (debug mode — events disabled in __DEV__)');
    } else if (this._posthog) {
      logger.info('[Analytics] PostHog client ready');
      this.startSessionTracking();
    } else {
      logger.warn('[Analytics] No PostHog API key configured — analytics disabled');
    }
  }

  /**
   * Track a custom event
   */
  track(eventName: string, props?: Record<string, string | number | boolean | null>) {
    if (!this.posthog) return;

    try {
      const enrichedProps = {
        ...props,
        $app_version: AppConfig.appVersion,
        $device_name: Device.deviceName,
        $device_model: Device.modelName,
        $os_name: Platform.OS,
        $os_version: Device.osVersion,
        $is_tablet: Device.deviceType === Device.DeviceType.TABLET,
        $is_dev: __DEV__ || !Device.isDevice,
        $app_variant: process.env.EXPO_PUBLIC_APP_VARIANT || 'production',
        $build_type: BUILD_TYPE,
        is_test_build: BUILD_TYPE !== 'production',
      };

      this.posthog.capture(eventName, enrichedProps);
      if (__DEV__) {
        logger.debug(`[Analytics] Tracked: ${eventName}`, enrichedProps);
      }
    } catch (error) {
      logger.error(`[Analytics] Failed to track event: ${eventName}`, error);
    }
  }

  /**
   * Identify the user/device with enhanced properties
   */
  identify(distinctId: string, properties?: Record<string, string | number | boolean>) {
    if (!this.posthog) return;

    try {
      const enhancedProperties = {
        ...properties,
        $app_version: AppConfig.appVersion,
        $device_name: Device.deviceName,
        $device_model: Device.modelName,
        $os_name: Platform.OS,
        $os_version: Device.osVersion,
        $is_tablet: Device.deviceType === Device.DeviceType.TABLET,
        $is_dev: __DEV__ || !Device.isDevice,
        $app_variant: process.env.EXPO_PUBLIC_APP_VARIANT || 'production',
        $app_build_number: Application.nativeBuildVersion || 'unknown',
        $app_id: Application.applicationId || 'unknown',
        $build_type: BUILD_TYPE,
        is_test_build: BUILD_TYPE !== 'production',
      };

      this.posthog.identify(distinctId, enhancedProperties);
      if (__DEV__) {
        logger.debug(`[Analytics] Identified: ${distinctId}`, enhancedProperties);
      }
    } catch (error) {
      logger.error(`[Analytics] Failed to identify user: ${distinctId}`, error);
    }
  }

  /**
   * Track a screen view
   */
  screen(screenName: string, props?: Record<string, string | number | boolean>) {
    if (!this.posthog) return;

    try {
      this.posthog.screen(screenName, props);
      if (__DEV__) {
        logger.debug(`[Analytics] Screen: ${screenName}`, props);
      }
    } catch (error) {
      logger.error(`[Analytics] Failed to track screen: ${screenName}`, error);
    }
  }

  /**
   * Specialized events
   */
  logAccountCreated(type: string, currency: string) {
    this.track('account_created', { type, currency });
  }

  logTransactionCreated(mode: 'simple' | 'advanced' | 'import', type: string, currency: string) {
    this.track('transaction_created', { mode, type, currency });
  }

  logOnboardingComplete(currency: string) {
    this.track('onboarding_complete', { currency });
  }

  logCurrencyChanged(oldCurrency: string, newCurrency: string) {
    this.track('currency_changed', { from: oldCurrency, to: newCurrency });
  }

  logImportCompleted(pluginId: string, stats: ImportStats) {
    this.track('import_completed', {
      pluginId,
      accounts: stats.accounts,
      journals: stats.journals,
      transactions: stats.transactions,
      auditLogs: stats.auditLogs || 0,
      skippedTransactions: stats.skippedTransactions,
      skippedItems: stats.skippedItems?.length || 0,
    });
  }

  logExportCompleted(format: string) {
    this.track('export_completed', { format });
  }

  logFactoryReset() {
    this.track('factory_reset');
  }

  logEntrypointOpened(screen: string, entrypoint: string) {
    this.track('entrypoint_opened', { screen, entrypoint });
  }

  logEntrypointSelected(screen: string, entrypoint: string, target: string) {
    this.track('entrypoint_selected', { screen, entrypoint, target });
  }

  logError(error: Error, componentStack?: string) {
    const trimLimit = AppConfig.constants.validation.maxTrimLength;
    this.track('app_error', {
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, trimLimit) || 'no-stack', // Trim long stacks
      componentStack: componentStack?.slice(0, trimLimit) || 'no-component-stack',
    });
  }

  /**
   * Session tracking methods
   */
  private startSessionTracking() {
    this.sessionStartTime = Date.now();
    this.track('session_start');
    this.setupSessionTimeout();
  }

  private setupSessionTimeout() {
    if (this.sessionTimeoutTimer) {
      clearTimeout(this.sessionTimeoutTimer);
    }

    // End session after 30 minutes of inactivity
    this.sessionTimeoutTimer = setTimeout(
      () => {
        this.endSession();
      },
      30 * 60 * 1000,
    );
  }

  private endSession() {
    const sessionDuration = Date.now() - this.sessionStartTime;
    this.track('session_end', {
      session_duration_ms: sessionDuration,
      session_duration_min: Math.round(sessionDuration / (1000 * 60)),
    });
  }

  updateActivity() {
    this.setupSessionTimeout();
  }

  /**
   * Enhanced user behavior tracking
   */
  trackUserInteraction(action: string, context?: Record<string, any>) {
    this.updateActivity();
    this.track(`user_${action}`, context);
  }

  trackFeatureUsage(feature: string, action: string, properties?: Record<string, any>) {
    this.updateActivity();
    this.track(`feature_${feature}_${action}`, {
      feature,
      action,
      ...properties,
    });
  }

  trackOnboardingStep(step: string, completed: boolean = true) {
    this.track('onboarding_step', {
      step,
      completed,
      onboarding_progress: completed ? 'completed' : 'started',
    });
  }

  trackConversion(event: string, value?: number, currency?: string) {
    this.track('conversion', {
      conversion_event: event,
      value: value || null,
      currency: currency || null,
      timestamp: Date.now(),
    });
  }

  /**
   * Update user properties for better segmentation
   */
  updateUserProperties(properties: Record<string, any>) {
    if (!this.posthog) return;

    try {
      this.posthog.setPersonProperties(properties);
      if (__DEV__) {
        logger.debug('[Analytics] Updated user properties', properties);
      }
    } catch (error) {
      logger.error('[Analytics] Failed to update user properties', error);
    }
  }

  /**
   * Track app performance metrics
   */
  trackPerformance(
    metric: string,
    value: number,
    context?: Record<string, any>,
    unit: string = 'ms',
  ) {
    this.track('performance', {
      ...context,
      metric,
      value,
      unit,
      timestamp: Date.now(),
      traceId: context?.traceId,
    });
  }

  /**
   * Track user engagement and retention
   */
  trackEngagement(type: string, properties?: Record<string, any>) {
    const sessionDuration = Date.now() - this.sessionStartTime;
    this.track('engagement', {
      engagement_type: type,
      session_duration_ms: sessionDuration,
      session_duration_min: Math.round(sessionDuration / (1000 * 60)),
      ...properties,
    });
  }
}

export const analytics = new AnalyticsService();
