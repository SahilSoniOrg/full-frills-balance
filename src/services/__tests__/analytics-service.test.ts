// Set environment variables before ANY imports
process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'test-key';
process.env.EXPO_PUBLIC_POSTHOG_HOST = 'https://test.posthog.com';

import { AnalyticsService } from '../analytics-service';

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
        expect(() => analytics.logOnboardingComplete('USD')).not.toThrow();
        expect(() => analytics.logFactoryReset()).not.toThrow();
    });
});
