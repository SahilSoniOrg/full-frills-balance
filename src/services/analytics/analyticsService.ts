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
import PostHog from 'posthog-react-native';
import { AppState } from 'react-native';
import {
  getFeatureFlagProperties,
  getGlobalProperties,
  navigationIntegration,
  RESOLVED_POSTHOG_API_KEY,
  POSTHOG_HOST,
  SENTRY_DSN,
  SENTRY_DIST,
  SENTRY_RELEASE,
  BUILD_TYPE,
  type AnalyticsProperties,
} from './analyticsConfig';
import { FeatureEventMap, KnownFeature } from './featureEventCatalog';
import { storage } from '@/src/utils/storage';
import { safeParseJSON } from '@/src/utils/serialization';

const FEATURE_FLAG_CACHE_KEY = 'analytics.posthog.feature-flags';
// Headless tasks use the persisted flag snapshot. Expire permission so an
// inactive install cannot keep background Gmail access indefinitely.
const FEATURE_FLAG_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface CachedFeatureFlags {
  distinctId: string;
  evaluatedAt: number;
  values: Record<string, boolean | string>;
}

function featureFlagValues(value: unknown): Record<string, boolean | string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const flags: Record<string, boolean | string> = {};
  for (const [key, flag] of Object.entries(value)) {
    if (typeof flag === 'boolean' || typeof flag === 'string') flags[key] = flag;
  }
  return flags;
}

function readCachedFeatureFlags(): CachedFeatureFlags | null {
  const raw = storage.getString(FEATURE_FLAG_CACHE_KEY);
  const parsed = raw ? safeParseJSON<Record<string, unknown> | null>(raw, null) : null;
  if (
    !parsed ||
    typeof parsed.distinctId !== 'string' ||
    typeof parsed.evaluatedAt !== 'number' ||
    !Number.isFinite(parsed.evaluatedAt)
  )
    return null;
  return {
    distinctId: parsed.distinctId,
    evaluatedAt: parsed.evaluatedAt,
    values: featureFlagValues(parsed.values),
  };
}

export class AnalyticsService {
  private _posthog: PostHog | null = null;
  private _posthogFeatureFlagUnsubscribe: (() => void) | null = null;
  private featureFlagListeners = new Set<() => void>();
  private identifiedDistinctId: string | null = null;
  private featureFlagsReady = false;
  private featureFlagRefreshPending = false;
  private cachedFeatureFlags = readCachedFeatureFlags();
  private featureFlagExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  private posthogAppStateSubscription: { remove: () => void } | null = null;
  private _initialized = false;
  private sessionStartTime = 0;
  private sessionTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDroppedEventSignal = 0;

  // Sentry 7.11 strips JS privacy hooks from native initialization. Native crash reports
  // can retain exception text and crash-memory strings, so only sanitized JS reporting
  // is enabled until equivalent native redaction exists.
  // Never set replaysSessionSampleRate/replaysOnErrorSampleRate: any number, even 0,
  // installs the mobile replay integration.
  private static readonly SENTRY_OPTIONS = {
    sendDefaultPii: false,
    enableNative: false,
    enableNativeCrashHandling: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    // iOS-only native options; automatic native breadcrumbs bypass beforeBreadcrumb.
    enableAutoBreadcrumbTracking: false,
    enableNetworkBreadcrumbs: false,
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

    const isPosthogEnabled = this.isPostHogConfigured();

    if (isPosthogEnabled) {
      try {
        this._posthog = new PostHog(RESOLVED_POSTHOG_API_KEY, {
          host: POSTHOG_HOST,
          disabled: !isPosthogEnabled,
          errorTracking: { autocapture: false, exceptionSteps: { enabled: false } },
          captureAppLifecycleEvents: false,
          capturePushNotificationSubscriptions: false,
          capturePushNotificationOpened: false,
          enablePersistSessionIdAcrossRestart: true,
          // The app identifies its stable anonymous device ID immediately after init.
          // Avoid evaluating flags against PostHog's temporary SDK-generated ID first.
          preloadFeatureFlags: false,
          customAppProperties: props =>
            sanitizeGlobalAnalyticsProperties({ ...props, ...getGlobalProperties() }),
          enableSessionReplay: false,
        });

        this._posthogFeatureFlagUnsubscribe?.();
        this._posthogFeatureFlagUnsubscribe =
          this._posthog.onFeatureFlags?.(flags => this.recordFeatureFlags(flags)) ?? null;
        this.posthogAppStateSubscription?.remove();
        this.posthogAppStateSubscription = AppState.addEventListener('change', state => {
          if (state === 'active') this.refreshFeatureFlags();
        });

        // Sync user with Sentry once PostHog is ready
        const distinctId = this._posthog.getDistinctId();
        Sentry.setUser({ id: distinctId });

        if (__DEV__) {
          logger.info('[Analytics] PostHog client ready (debug mode)');
        }
        if (!__DEV__ || AppConfig.features.enablePostHog) {
          logger.info('[Analytics] PostHog client ready');
          this.startSessionTracking();
        }
      } catch (error) {
        logger.error('[Analytics] Failed to create PostHog instance', error);
      }
    }

    this._initialized = true;
  }

  private isPostHogConfigured(): boolean {
    return (
      typeof RESOLVED_POSTHOG_API_KEY === 'string' &&
      RESOLVED_POSTHOG_API_KEY.trim().length > 0 &&
      AppConfig.features.enablePostHog
    );
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
        dsn: SENTRY_DSN,
        enabled: true,
        debug: false,
        ...AnalyticsService.SENTRY_OPTIONS,
        tracesSampleRate: __DEV__ ? 1.0 : 0.15,
        release: SENTRY_RELEASE,
        dist: SENTRY_DIST,
        environment: BUILD_TYPE,
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
    if (safeProperties === null) {
      this.signalDroppedEvent(eventName);
      if (__DEV__) {
        logger.warn(`[Analytics] Dropped undeclared or invalid event: ${eventName}`);
      }
      return false;
    }

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

  /** Read a cached PostHog flag without emitting a `$feature_flag_called` event. */
  isFeatureFlagEnabled(key: string): boolean {
    if (
      !this.featureFlagsReady ||
      this.featureFlagRefreshPending ||
      !this.isPostHogConfigured() ||
      !this.hasFreshFeatureFlagSnapshot(this.identifiedDistinctId)
    )
      return false;
    try {
      return this._posthog?.getFeatureFlag?.(key, { sendEvent: false }) === true;
    } catch {
      return false;
    }
  }

  /** Last PostHog evaluation, including the persisted snapshot used by headless tasks. */
  isFeatureFlagEnabledFromLastFetch(key: string, expectedDistinctId?: string): boolean {
    const distinctId = expectedDistinctId ?? this.identifiedDistinctId;
    if (!this.isPostHogConfigured() || !distinctId || !this.hasFreshFeatureFlagSnapshot(distinctId))
      return false;
    if (this.featureFlagRefreshPending) return false;
    if (!expectedDistinctId && !this.featureFlagsReady) return false;
    if (this.featureFlagsReady) return this.isFeatureFlagEnabled(key);
    if (this.cachedFeatureFlags?.distinctId !== expectedDistinctId) return false;
    return this.cachedFeatureFlags?.values[key] === true;
  }

  private hasFreshFeatureFlagSnapshot(distinctId: string | null): boolean {
    const snapshot = this.cachedFeatureFlags;
    if (!snapshot || !distinctId || snapshot.distinctId !== distinctId) return false;
    const age = Date.now() - snapshot.evaluatedAt;
    return age >= 0 && age <= FEATURE_FLAG_CACHE_MAX_AGE_MS;
  }

  private invalidateCachedFeatureFlags(distinctId: string) {
    if (this.featureFlagExpiryTimer) clearTimeout(this.featureFlagExpiryTimer);
    this.featureFlagExpiryTimer = null;
    this.cachedFeatureFlags = { distinctId, evaluatedAt: 0, values: {} };
    try {
      storage.set(FEATURE_FLAG_CACHE_KEY, JSON.stringify(this.cachedFeatureFlags));
    } catch (error) {
      logger.warn('[Analytics] Could not invalidate cached feature flags', { error });
    }
  }

  private refreshFeatureFlags() {
    if (!this._posthog || !this.identifiedDistinctId || !this.isPostHogConfigured()) return;
    this.featureFlagRefreshPending = true;
    this.featureFlagsReady = false;
    this.invalidateCachedFeatureFlags(this.identifiedDistinctId);
    this.notifyFeatureFlagListeners();
    void this._posthog
      .reloadFeatureFlagsAsync()
      .then(flags => {
        // onFeatureFlags normally stores this first; keep a fallback for SDK responses
        // that resolve without notifying listeners.
        if (this.featureFlagRefreshPending && flags) this.recordFeatureFlags(flags);
      })
      .catch(error => {
        logger.warn('[Analytics] Could not refresh feature flags', { error });
        // Keep the app fail-closed until a later successful refresh.
      });
  }

  private scheduleFeatureFlagExpiry() {
    if (this.featureFlagExpiryTimer) clearTimeout(this.featureFlagExpiryTimer);
    const snapshot = this.cachedFeatureFlags;
    if (!snapshot) {
      this.featureFlagExpiryTimer = null;
      return;
    }
    const remaining = snapshot.evaluatedAt + FEATURE_FLAG_CACHE_MAX_AGE_MS - Date.now();
    if (remaining <= 0) {
      this.featureFlagsReady = false;
      this.featureFlagExpiryTimer = null;
      this.notifyFeatureFlagListeners();
      return;
    }
    this.featureFlagExpiryTimer = setTimeout(() => {
      if (this.cachedFeatureFlags !== snapshot) return;
      this.featureFlagsReady = false;
      this.featureFlagExpiryTimer = null;
      this.notifyFeatureFlagListeners();
    }, remaining);
  }

  private recordFeatureFlags(flags: Record<string, boolean | string>) {
    if (!this.identifiedDistinctId) return;
    this.featureFlagsReady = true;
    this.featureFlagRefreshPending = false;
    this.cachedFeatureFlags = {
      distinctId: this.identifiedDistinctId,
      evaluatedAt: Date.now(),
      values: featureFlagValues(flags),
    };
    try {
      storage.set(FEATURE_FLAG_CACHE_KEY, JSON.stringify(this.cachedFeatureFlags));
    } catch (error) {
      logger.warn('[Analytics] Could not persist feature flag state', { error });
    }
    this.scheduleFeatureFlagExpiry();
    this.notifyFeatureFlagListeners();
  }

  /** Subscribe to remote feature flag updates. Missing or unavailable flags stay off. */
  subscribeToFeatureFlags(onChange: () => void): () => void {
    this.featureFlagListeners.add(onChange);
    return () => {
      this.featureFlagListeners.delete(onChange);
    };
  }

  private notifyFeatureFlagListeners() {
    this.featureFlagListeners.forEach(listener => listener());
  }

  /**
   * Identify the user/device with enhanced properties
   */
  identify(distinctId: string) {
    const safeId = safeAnalyticsIdentity(distinctId);
    Sentry.setUser({ id: safeId });
    if (!this._posthog) return;

    try {
      const existingDistinctId = this._posthog.getDistinctId();
      if (this.identifiedDistinctId !== safeId) {
        this.identifiedDistinctId = safeId;
        this.featureFlagsReady = false;
        this.featureFlagRefreshPending = true;
        this.invalidateCachedFeatureFlags(safeId);
        this.notifyFeatureFlagListeners();
      }
      this._posthog.setPersonPropertiesForFlags(getFeatureFlagProperties(safeId), false);
      this._posthog.identify(safeId);
      // A same-ID identify does not reload flags in the SDK. The first launch's
      // identify transition already triggers a request; later launches need this.
      if (!existingDistinctId || existingDistinctId === safeId) this.refreshFeatureFlags();
      if (__DEV__) {
        logger.debug('[Analytics] Identified anonymous device');
      }
    } catch (error) {
      logger.error('[Analytics] Failed to identify anonymous device', error);
    }
  }

  async flush() {
    if (!this._posthog) return;
    try {
      await this._posthog.flush();
    } catch (error) {
      logger.warn('[Analytics] PostHog flush failed', { error });
    }
  }

  /**
   * Track a screen view
   */
  screen(screenName: string, props?: Record<string, string | number | boolean>) {
    if (!this._posthog) return;
    const safeProperties = sanitizeAnalyticsProperties('$screen', {
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

  captureAppError(error: Error, componentStack?: string) {
    this.track('app_error', { name: error.name });
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
    if (!this.sessionStartTime) return;
    const sessionDuration = Date.now() - this.sessionStartTime;
    this.track('session_end', {
      session_duration_ms: sessionDuration,
      session_duration_min: Math.round(sessionDuration / (1000 * 60)),
      end_reason: 'inactivity',
    });
    this.sessionStartTime = 0;
    this.sessionTimeoutTimer = null;
  }

  onAppBackground() {
    if (!this._posthog) return;
    this.track('app_backgrounded');
    this.endSessionWithReason('background');
    void this._posthog.flush().catch(() => undefined);
  }

  onAppForeground() {
    if (!this._posthog) return;
    this.track('app_foregrounded');
    this.startSessionTracking();
  }

  private endSessionWithReason(reason: 'background') {
    if (!this.sessionStartTime) return;
    const sessionDuration = Date.now() - this.sessionStartTime;
    this.track('session_end', {
      session_duration_ms: sessionDuration,
      session_duration_min: Math.round(sessionDuration / 60000),
      end_reason: reason,
    });
    this.sessionStartTime = 0;
    if (this.sessionTimeoutTimer) clearTimeout(this.sessionTimeoutTimer);
    this.sessionTimeoutTimer = null;
  }

  private signalDroppedEvent(eventName: string) {
    if (!this._posthog || Date.now() - this.lastDroppedEventSignal < 60_000) return;
    const safeName = /^[a-z][a-z0-9_]{0,63}$/.test(eventName) ? eventName : 'unknown';
    this.lastDroppedEventSignal = Date.now();
    try {
      this._posthog.capture('analytics_event_dropped', { event_name: safeName });
    } catch {
      // Drop reporting must never interfere with application behavior.
    }
  }

  updateActivity() {
    // Session tracking starts with PostHog. Before that point there is no
    // active session to keep alive, and scheduling a timer only leaks work in
    // non-analytics environments (including Jest).
    if (!this._posthog) return;
    if (!this.sessionStartTime) {
      this.startSessionTracking();
      return;
    }
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
}

export const analytics = new AnalyticsService();
