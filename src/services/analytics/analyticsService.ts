import { AppConfig } from '@/src/constants/app-config';
import { ImportStats } from '@/src/services/import';
import { logger } from '@/src/utils/logger';
import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import PostHog from 'posthog-react-native';
import {
  getGlobalProperties,
  navigationIntegration,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
  type AnalyticsProperties,
} from './analyticsConfig';
import { FeatureEventMap, KnownFeature } from './types';

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
   * Stage 1: Early initialization of Sentry only.
   * MUST be called at the very top of index.js to catch early boot errors.
   */
  earlyInitializeSentry() {
    if (this._initialized) return;
    this.initializeSentry();

    // Register as the performance reporter early so we don't miss early traces
    logger.setPerformanceReporter((metric, value, context) => {
      this.trackPerformance(metric, value, context as AnalyticsProperties | undefined);
    });
  }

  /**
   * Stage 2: Delayed initialization of PostHog and session tracking.
   * Called during the background stabilization phase to avoid blocking startup.
   */
  delayedInitializePostHog() {
    if (this._posthog) return;

    const isPosthogEnabled =
      typeof POSTHOG_API_KEY === 'string' &&
      POSTHOG_API_KEY.trim().length > 0 &&
      AppConfig.features.enablePostHog;

    if (isPosthogEnabled) {
      try {
        this._posthog = new PostHog(POSTHOG_API_KEY, {
          host: POSTHOG_HOST,
          disabled: !isPosthogEnabled,
          errorTracking: { autocapture: true },
          enablePersistSessionIdAcrossRestart: true,
          customAppProperties: props => ({
            ...props,
            ...getGlobalProperties(),
          }),
          enableSessionReplay: false,
        });

        // Sync user with Sentry once PostHog is ready
        const distinctId = this._posthog.getDistinctId();
        Sentry.setUser({ id: distinctId });

        if (__DEV__) {
          logger.info('[Analytics] PostHog client ready (debug mode)');
        } else {
          logger.info('[Analytics] PostHog client ready');
          this.startSessionTracking();
        }
      } catch (error) {
        logger.error('[Analytics] Failed to create PostHog instance', error);
      }
    }

    this._initialized = true;
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
        enabled: true,
        debug: false,
        tracesSampleRate: 1.0,
        integrations: [navigationIntegration, Sentry.reactNativeTracingIntegration()],
      });

      if (this._posthog) {
        const distinctId = this._posthog.getDistinctId();
        Sentry.setUser({ id: distinctId });
      }

      logger.info('[Analytics] Sentry initialized');
    } catch (error) {
      logger.error('[Analytics] Failed to initialize Sentry', error);
    }
  }

  /**
   * Track a custom event
   */
  track(eventName: string, props?: AnalyticsProperties) {
    if (!this.posthog) return;

    try {
      this.posthog.capture(
        eventName,
        Object.fromEntries(
          Object.entries(props ?? {}).filter(([, value]) => value !== undefined),
        ) as Record<string, string | number | boolean | null>,
      );
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

  logBudgetCreated(_amount: number, currency: string) {
    this.track('budget_created', { currency });
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

  logAiIngestion(
    event:
      | 'deterministic_success'
      | 'ai_fallback_triggered'
      | 'ai_forced'
      | 'ai_timeout'
      | 'ai_failure'
      | 'ai_success'
      | 'reversal_detected'
      | 'amount_missing',
    properties?: AnalyticsProperties,
  ) {
    this.track(`parse_${event}`, properties);
  }

  logAiCorrection(
    type: 'account' | 'category' | 'amount' | 'undo_autosave' | 'edit_after_autosave',
  ) {
    this.track(`user_correction_${type}`);
  }

  logAiModelLoad(success: boolean, properties?: AnalyticsProperties) {
    this.trackFeatureUsage('ai', success ? 'model_load_success' : 'model_load_failure', properties);
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
      stack: error.stack?.slice(0, trimLimit) || 'no-stack',
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
  trackUserInteraction(action: string, context?: AnalyticsProperties) {
    this.updateActivity();
    this.track(`user_${action}`, context);
  }

  trackFeatureUsage<F extends KnownFeature | (string & {})>(
    feature: F,
    action: F extends KnownFeature ? FeatureEventMap[F] : string,
    properties?: AnalyticsProperties,
  ) {
    this.updateActivity();
    this.track(`feature_${feature}_${action}`, {
      feature,
      action,
      ...properties,
    });
  }

  /**
   * Dynamically update active workplace super-properties
   */
  syncActiveWorkplace(workplaceId: string, currencyCode: string) {
    this.updateUserProperties({
      active_workplace_id: workplaceId,
      active_currency: currencyCode,
    });
  }

  /**
   * Sync telemetry privacy controls
   */
  syncPrivacySettings(enableAnalytics: boolean) {
    if (!this._posthog) return;
    if (enableAnalytics) {
      this._posthog.optIn();
    } else {
      this._posthog.optOut();
    }
  }

  trackOnboardingStep(step: string, completed: boolean = true) {
    this.track('onboarding_step', {
      step,
      completed,
      onboarding_progress: completed ? 'completed' : 'started',
    });
  }

  trackConversion(event: string) {
    this.track('conversion', {
      conversion_event: event,
      timestamp: Date.now(),
    });
  }

  /**
   * Update user properties for better segmentation
   */
  updateUserProperties(properties: AnalyticsProperties) {
    if (!this.posthog) return;

    try {
      this.posthog.setPersonProperties(
        Object.fromEntries(
          Object.entries(properties).filter(([, value]) => value !== undefined),
        ) as Record<string, string | number | boolean | null>,
      );
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
    context?: AnalyticsProperties,
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
  trackEngagement(type: string, properties?: AnalyticsProperties) {
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
