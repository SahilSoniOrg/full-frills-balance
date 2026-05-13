import { AppConfig } from '@/src/constants/app-config';
import { schema } from '@/src/data/database/schema';
import { ImportStats } from '@/src/services/import';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import * as Sentry from '@sentry/react-native';
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

export const navigationIntegration = Sentry.reactNavigationIntegration();

export class AnalyticsService {
  private _posthog: PostHog | null = null;
  private _initialized = false;
  private sessionStartTime: number = Date.now();
  private sessionTimeoutTimer: NodeJS.Timeout | null = null;

  public get posthog(): PostHog | null {
    return this._posthog;
  }

  /**
   * Get the anonymous distinct ID for the current user.
   */
  getDistinctId(): string {
    return this._posthog?.getDistinctId() || 'anonymous';
  }

  /**
   * Initialize analytics provider.
   * Guaranteed to be idempotent and safe to call multiple times.
   */
  initialize() {
    if (this._initialized) return;

    const isPosthogEnabled =
      typeof POSTHOG_API_KEY === 'string' &&
      POSTHOG_API_KEY.trim().length > 0 &&
      AppConfig.features.enablePostHog;
    // 1. Setup PostHog instance on-demand
    if (!this._posthog && isPosthogEnabled) {
      try {
        this._posthog = new PostHog(POSTHOG_API_KEY, {
          host: POSTHOG_HOST,
          // Temporarily enabled in dev for verification
          disabled: !isPosthogEnabled,
          // Enable error tracking
          errorTracking: { autocapture: true },
          // Better mobile session tracking
          enablePersistSessionIdAcrossRestart: true,
          // Automatically enrich EVERY event (including autocaptured ones)
          customAppProperties: props => ({
            ...props,
            ...this.getGlobalProperties(),
          }),
          // Temporarily enabled in dev for verification
          enableSessionReplay: true,
          sessionReplayConfig: {
            sampleRate: 1.0, // 100% sampling for testing
            maskAllTextInputs: true,
            maskAllImages: true,
            captureLog: true, // Capture console logs in replays
          },
        });
      } catch (error) {
        logger.error('[Analytics] Failed to create PostHog instance', error);
      }
    }

    // 2. Register as the performance reporter for the logger metric layer
    logger.setPerformanceReporter((metric, value, context) => {
      this.trackPerformance(metric, value, context);
    });

    // 3. Sync ID to Sentry for cross-platform correlation
    if (this._posthog) {
      const distinctId = this._posthog.getDistinctId();
      Sentry.setUser({ id: distinctId });
    }

    this.initializeSentry();
    this._initialized = true;

    if (this._posthog && __DEV__) {
      logger.info('[Analytics] PostHog client ready (debug mode — events disabled in __DEV__)');
    } else if (this._posthog) {
      logger.info('[Analytics] PostHog client ready');
      this.startSessionTracking();
    } else {
      logger.warn('[Analytics] Analytics disabled (missing key or dev mode)');
    }
  }

  /**
   * Initialize Sentry for error tracking and performance monitoring.
   */
  private initializeSentry() {
    if (!AppConfig.features.enableSentry) {
      logger.info('[Analytics] Sentry disabled by config');
      return;
    }

    try {
      Sentry.init({
        dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
        enabled: true, // We already checked the config flag above
        debug: false,
        tracesSampleRate: 1.0,
        // Session Replay
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
        integrations: [
          navigationIntegration,
          Sentry.reactNativeTracingIntegration(),
          Sentry.mobileReplayIntegration(),
        ],
        enableUserInteractionTracing: true,
      });
      logger.info('[Analytics] Sentry initialized');
    } catch (error) {
      logger.error('[Analytics] Failed to initialize Sentry', error);
    }
  }
  /**
   * Get global properties for event enrichment
   */
  private getGlobalProperties(): Record<string, any> {
    return {
      $app_id: Application.applicationId || 'unknown',
      $app_namespace: Application.applicationId || 'unknown',
      $app_name: Application.applicationName || 'Full Frills Balance',
      $app_version: Application.nativeApplicationVersion || AppConfig.appVersion,
      $app_build: Application.nativeBuildVersion || '1',
      $app_build_number: Application.nativeBuildVersion || '1', // Keep for backward compatibility
      $device_name: Device.deviceName,
      $device_model: Device.modelName,
      $os_name: Platform.OS,
      $os_version: Device.osVersion,
      $is_tablet: Device.deviceType === Device.DeviceType.TABLET,
      $is_dev: __DEV__ || !Device.isDevice,
      $app_variant: process.env.EXPO_PUBLIC_APP_VARIANT || 'production',
      $build_type: BUILD_TYPE,
      $active_workplace_id: preferences.activeWorkplaceId || 'none',
      $db_schema_version: schema.version,
      is_test_build: BUILD_TYPE !== 'production',
    };
  }

  /**
   * Track a custom event
   */
  track(eventName: string, props?: Record<string, string | number | boolean | null>) {
    if (!this.posthog) return;

    try {
      this.posthog.capture(eventName, props);
      if (__DEV__) {
        logger.debug(`[Analytics] Tracked: ${eventName}`, props);
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
      this.posthog.identify(distinctId, properties);
      if (__DEV__) {
        logger.debug(`[Analytics] Identified: ${distinctId}`, properties);
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
  logAppOpened() {
    this.track('app_opened', {
      version: Application.nativeApplicationVersion || AppConfig.appVersion,
      app_version: Application.nativeApplicationVersion || AppConfig.appVersion,
      build: Application.nativeBuildVersion || '1',
      app_build: Application.nativeBuildVersion || '1',
    });
  }

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

  logThemeChanged(theme: string, themeId: string, fontId: string) {
    this.track('theme_changed', { theme, themeId, fontId });
  }

  logNotificationPreferenceChanged(cadence: string, hour: number) {
    this.track('notification_preference_changed', { cadence, hour });
  }

  logWorkplaceCreated(name: string, icon: string) {
    this.track('workplace_created', { name_length: name.length, icon });
  }

  logWorkplaceSwitched(fromId: string, toId: string) {
    this.track('workplace_switched', { fromId, toId });
  }

  logWorkplaceDeleted() {
    this.track('workplace_deleted');
  }

  logBudgetCreated(amount: number, currency: string) {
    this.track('budget_created', { amount, currency });
  }

  logPlannedPaymentCreated(interval: string, type: string) {
    this.track('planned_payment_created', { interval, type });
  }

  logSmsRuleTriggered(ruleId: string, isAutoPosted: boolean) {
    this.track('sms_rule_triggered', { ruleId, isAutoPosted });
  }

  logSmsImportSettingsChanged(enabled: boolean) {
    this.track('sms_import_settings_changed', { enabled });
  }

  logChartInteracted(chartName: string, interactionType: string) {
    this.track('chart_interacted', { chartName, interactionType });
  }

  logSearchPerformed(scope: string, queryLength: number) {
    this.track('search_performed', { scope, queryLength });
  }

  logDatabaseMigration(version: number, durationMs: number) {
    this.track('database_migration', { version, duration_ms: durationMs });
  }

  logIntegrityIssue(table: string, issueType: string) {
    this.track('integrity_issue', { table, issueType });
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

    // Report to Sentry with component stack
    Sentry.captureException(error, {
      contexts: {
        react: { componentStack },
      },
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
