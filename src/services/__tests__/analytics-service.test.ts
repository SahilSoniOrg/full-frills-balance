import { AnalyticsService } from '../analytics/analyticsService';
import * as Sentry from '@sentry/react-native';
import { AppConfig } from '@/src/constants/app-config';

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
    jest.clearAllMocks();
    analytics = new AnalyticsService();
  });

  it('should not throw when calling track', () => {
    expect(() => analytics.track('test_event', { foo: 'bar' })).not.toThrow();
  });

  it('should not throw when calling identify', () => {
    expect(() => analytics.identify('test_user', { name: 'Test' })).not.toThrow();
  });

  it('should not throw when calling screen', () => {
    expect(() => analytics.screen('HomeScreen', { source: 'onboarding' })).not.toThrow();
  });

  it('should not throw when calling specialized events', () => {
    expect(() => analytics.logAccountCreated('Checking', 'USD')).not.toThrow();
    expect(() => analytics.logPrivacyPolicyAcknowledged('2026-09-07')).not.toThrow();
    expect(() => analytics.logFactoryReset()).not.toThrow();
  });

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

  it('disables Sentry native channels that cannot run JavaScript sanitizers', () => {
    const previous = AppConfig.features.enableSentry;
    (AppConfig.features as { enableSentry: boolean }).enableSentry = true;
    const init = jest.spyOn(Sentry, 'init').mockImplementation(() => undefined);
    try {
      (analytics as unknown as { initializeSentry: () => void }).initializeSentry();
      expect(init).toHaveBeenCalledWith(
        expect.objectContaining({
          enableNative: false,
          enableNativeCrashHandling: false,
          sendDefaultPii: false,
          beforeSend: expect.any(Function),
          beforeBreadcrumb: expect.any(Function),
          beforeSendTransaction: expect.any(Function),
        }),
      );
    } finally {
      init.mockRestore();
      (AppConfig.features as { enableSentry: boolean }).enableSentry = previous;
    }
  });
});
