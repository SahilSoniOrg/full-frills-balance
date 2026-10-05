import { ANALYTICS_SANITIZE_CASES } from '@/src/testing/analyticsPrivacyFixtures';
import { AnalyticsService } from '../analytics/analyticsService';
import * as Sentry from '@sentry/react-native';
import { AppConfig } from '@/src/constants/app-config';
import { sanitizeAnalyticsProperties } from '@/src/utils/observabilityPrivacy';

// Mock PostHog
jest.mock('posthog-react-native', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      capture: jest.fn(),
      identify: jest.fn(),
      screen: jest.fn(),
      reset: jest.fn(),
    })),
  };
});

describe('AnalyticsService', () => {
  let analytics: AnalyticsService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    analytics = new AnalyticsService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(ANALYTICS_SANITIZE_CASES)(
    'track applies the same analytics sanitization as observabilityPrivacy for %s',
    (eventName, input, expected) => {
      const capture = jest.fn();
      const client = {
        capture,
        getDistinctId: () => 'anon_123e4567-e89b-42d3-a456-426614174000',
        identify: jest.fn(),
        screen: jest.fn(),
        setPersonProperties: jest.fn(),
      };
      (analytics as unknown as { _posthog: typeof client })._posthog = client;

      expect(analytics.track(eventName, input)).toBe(expected !== null);
      if (expected === null) {
        expect(capture).not.toHaveBeenCalled();
      } else {
        expect(capture).toHaveBeenCalledWith(eventName, expected);
      }
      expect(sanitizeAnalyticsProperties(eventName, input)).toEqual(expected);
    },
  );

  it('does not schedule session tracking before PostHog initializes', () => {
    jest.useFakeTimers();
    try {
      analytics.trackFeatureUsage('account', 'reconcile');
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not initialize PostHog for pre-bootstrap privacy acknowledgement telemetry', () => {
    expect(analytics.logPrivacyPolicyAcknowledged('2026-09-07')).toBe(false);
  });

  it('sends real safe domain enums while stripping private markers from allowed slots', () => {
    const capture = jest.fn();
    const client = {
      capture,
      getDistinctId: () => 'anon_123e4567-e89b-42d3-a456-426614174000',
      identify: jest.fn(),
      screen: jest.fn(),
      setPersonProperties: jest.fn(),
    };
    (analytics as unknown as { _posthog: typeof client })._posthog = client;

    expect(
      analytics.track('account_created', {
        type: 'ASSET',
        currency: 'USD',
        account_name: 'PrivateMerchant',
      }),
    ).toBe(true);
    expect(
      analytics.track('planned_payment_created', {
        interval: 'WEEKLY',
        type: 'manual',
      }),
    ).toBe(true);
    expect(
      analytics.track('transaction_created', {
        type: 'create',
        mode: 'simple',
        currency: 'INR',
      }),
    ).toBe(true);
    analytics.trackFeatureUsage('safe_to_spend', 'section_expanded', { section: 'assets' });
    analytics.trackFeatureUsage('safe_to_spend', 'legend_pressed', { item: 'safe' });
    analytics.track('account_created', { type: 'PrivateMerchant', currency: 'USD' });

    expect(capture.mock.calls).toEqual([
      ['account_created', { type: 'ASSET', currency: 'USD' }],
      ['planned_payment_created', { interval: 'WEEKLY', type: 'manual' }],
      ['transaction_created', { type: 'create', mode: 'simple', currency: 'INR' }],
      [
        'feature_safe_to_spend_section_expanded',
        {
          feature: 'safe_to_spend',
          action: 'section_expanded',
          section: 'assets',
        },
      ],
      [
        'feature_safe_to_spend_legend_pressed',
        {
          feature: 'safe_to_spend',
          action: 'legend_pressed',
          item: 'safe',
        },
      ],
      ['account_created', { currency: 'USD' }],
    ]);
  });

  it('keeps unsanitized native reporting disabled while retaining sanitized JS reporting', () => {
    const previous = AppConfig.features.enableSentry;
    (AppConfig.features as { enableSentry: boolean }).enableSentry = true;
    const init = jest.spyOn(Sentry, 'init').mockImplementation(() => undefined);
    try {
      (analytics as unknown as { initializeSentry: () => void }).initializeSentry();
      expect(init).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          enableNative: false,
          enableNativeCrashHandling: false,
          attachScreenshot: false,
          attachViewHierarchy: false,
          enableAutoBreadcrumbTracking: false,
          enableNetworkBreadcrumbs: false,
          sendDefaultPii: false,
          beforeSend: expect.any(Function),
          beforeBreadcrumb: expect.any(Function),
          beforeSendTransaction: expect.any(Function),
        }),
      );
      const options = init.mock.calls[0][0] as Record<string, unknown>;
      expect(options).not.toHaveProperty('replaysSessionSampleRate');
      expect(options).not.toHaveProperty('replaysOnErrorSampleRate');
    } finally {
      init.mockRestore();
      (AppConfig.features as { enableSentry: boolean }).enableSentry = previous;
    }
  });

  it('never lets a private error message reach the Sentry payload', () => {
    const previous = AppConfig.features.enableSentry;
    (AppConfig.features as { enableSentry: boolean }).enableSentry = true;
    const init = jest.spyOn(Sentry, 'init').mockImplementation(() => undefined);
    const capture = jest.spyOn(Sentry, 'captureException').mockImplementation(() => '');
    try {
      (analytics as unknown as { initializeSentry: () => void }).initializeSentry();
      const { beforeSend } = init.mock.calls[0][0] as {
        beforeSend: (event: Sentry.ErrorEvent) => Sentry.ErrorEvent;
      };
      const privateError = new TypeError('Paid PrivateMerchant 450.00');
      analytics.logError(privateError);
      const captured = capture.mock.calls[0][0] as Error;

      const payload = beforeSend({
        exception: {
          values: [
            {
              type: captured.name,
              value: privateError.message,
              stacktrace: {
                frames: [
                  {
                    filename: 'app:///src/services/budget/budgetWriteService.ts',
                    function: 'createBudget',
                    lineno: 20,
                    colno: 4,
                    vars: { name: 'PrivateMerchant' },
                  },
                ],
              },
            },
          ],
        },
        extra: { note: 'PrivateMerchant' },
      } as unknown as Sentry.ErrorEvent);

      expect(`${captured.message}${captured.stack}`).not.toContain('PrivateMerchant');
      expect(JSON.stringify(payload)).not.toContain('PrivateMerchant');
      expect(payload.exception?.values?.[0]).toMatchObject({
        type: 'TypeError',
        stacktrace: { frames: [{ function: 'createBudget', lineno: 20, colno: 4 }] },
      });
    } finally {
      init.mockRestore();
      capture.mockRestore();
      (AppConfig.features as { enableSentry: boolean }).enableSentry = previous;
    }
  });
});
