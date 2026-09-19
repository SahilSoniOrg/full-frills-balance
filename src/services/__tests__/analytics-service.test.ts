import { AnalyticsService } from '../analytics/analyticsService';

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
    expect(() => analytics.logPrivacyPolicyAcknowledged('2026-09-17')).not.toThrow();
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
    expect(analytics.posthog).toBeNull();
    expect(analytics.logPrivacyPolicyAcknowledged('2026-09-17')).toBe(false);
    expect(analytics.posthog).toBeNull();
  });
});
