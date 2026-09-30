import { AppConfig } from '@/src/constants/app-config';
import { logger } from '@/src/utils/logger';
import {
  safeDiagnosticError,
  safeAnalyticsIdentity,
  sanitizeAnalyticsProperties,
  sanitizeGlobalAnalyticsProperties,
  sanitizeSentryBreadcrumb,
  sanitizeSentryErrorEvent,
  sanitizeSentryTransactionEvent,
} from '@/src/utils/observabilityPrivacy';
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
  private sessionTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  private static readonly SENTRY_OPTIONS = {
    sendDefaultPii: false,
    // Sentry 7.11 drops JS beforeSend hooks from native initialization options.
    // Disable the native SDK, leaving only JS transport behind our sanitizer.
    enableNative: false,
    enableNativeCrashHandling: false,
  } as const;

  /**
   * Get the anonymous distinct ID for the current user.
   */
  getDistinctId(): string {
    return safeAnalyticsIdentity(this._posthog?.getDistinctId());
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
          errorTracking: { autocapture: false, exceptionSteps: { enabled: false } },
          captureAppLifecycleEvents: false,
          capturePushNotificationSubscriptions: false,
          capturePushNotificationOpened: false,
          enablePersistSessionIdAcrossRestart: true,
          customAppProperties: props =>
            sanitizeGlobalAnalyticsProperties({ ...props, ...getGlobalProperties() }),
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
        ...AnalyticsService.SENTRY_OPTIONS,
        tracesSampleRate: 1.0,
        integrations: [navigationIntegration, Sentry.reactNativeTracingIntegration()],
        beforeSend: event => sanitizeSentryErrorEvent(event),
        beforeSendTransaction: event => sanitizeSentryTransactionEvent(event),
        beforeBreadcrumb: crumb => sanitizeSentryBreadcrumb(crumb),
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
  track(eventName: string, props?: AnalyticsProperties): boolean {
    if (!this._posthog) return false;
    const safeProperties = sanitizeAnalyticsProperties(eventName, props);
    if (safeProperties === null) return false;

    try {
      this._posthog.capture(eventName, safeProperties);
      if (__DEV__) {
        logger.debug(`[Analytics] Tracked event ${eventName}`);
      }
      return true;
    } catch (error) {
      logger.error(`[Analytics] Failed to track event: ${eventName}`, error);
      return false;
    }
  }

  /**
   * Identify the user/device with enhanced properties
   */
  identify(distinctId: string, properties?: Record<string, string | number | boolean>) {
    const safeId = safeAnalyticsIdentity(distinctId);
    Sentry.setUser({ id: safeId });
    if (!this._posthog) return;

    try {
      this._posthog.identify(safeId);
      if (__DEV__) {
        logger.debug('[Analytics] Identified anonymous device');
      }
    } catch (error) {
      logger.error('[Analytics] Failed to identify anonymous device', error);
    }
    void properties;
  }

  /**
   * Track a screen view
   */
  screen(screenName: string, props?: Record<string, string | number | boolean>) {
    if (!this._posthog) return;
    const safeProperties = sanitizeAnalyticsProperties('screen_view', {
      ...props,
      screen: screenName,
    });
    if (!safeProperties) return;

    try {
      this._posthog.screen(String(safeProperties.screen ?? 'other'), safeProperties);
      if (__DEV__) logger.debug('[Analytics] Screen viewed');
    } catch (error) {
      logger.error('[Analytics] Failed to track screen', error);
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

  /** Product telemetry only. The local MMKV acknowledgement is authoritative. */
  logPrivacyPolicyAcknowledged(policyVersion: string): boolean {
    // This event follows the same pre-bootstrap policy as every other event:
    // it is best-effort and is dropped until the central bootstrap initializes PostHog.
    return this.track('privacy_policy_acknowledged', {
      policy_version: policyVersion,
    });
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

  logIntegrityIssue(table: string, issueType: string) {
    this.track('integrity_issue', { table, issueType });
  }

  logJournalBalanceChecked(unbalancedCount: number, journalsChecked: number) {
    this.track('journal_balance_checked', {
      unbalanced_count: unbalancedCount,
      journals_checked: journalsChecked,
    });
  }

  logUnbalancedJournalsPromptAnswered(choice: 'fix_now' | 'later' | 'dismissed') {
    this.track('unbalanced_journals_prompt_answered', { choice });
  }

  logUnbalancedJournalsCleared(peakCount: number, daysOpen: number, source: string) {
    this.track('unbalanced_journals_cleared', {
      peak_count: peakCount,
      days_open: daysOpen,
      source,
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
    this.track('app_error', { name: error.name });

    // Report to Sentry with component stack
    Sentry.captureException(safeDiagnosticError(error));
    void componentStack;
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
    // Session tracking starts with PostHog. Before that point there is no
    // active session to keep alive, and scheduling a timer only leaks work in
    // non-analytics environments (including Jest).
    if (!this._posthog) return;
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
    if (!this._posthog) return;
    const safeProperties = sanitizeGlobalAnalyticsProperties(properties);

    try {
      if (Object.keys(safeProperties).length === 0) return;
      this._posthog.setPersonProperties(safeProperties);
      if (__DEV__) {
        logger.debug('[Analytics] Updated permitted app context');
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
