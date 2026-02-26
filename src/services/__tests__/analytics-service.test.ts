import { AnalyticsService, posthogClient } from '../analytics-service';

jest.mock('posthog-react-native');

describe('AnalyticsService', () => {
    let analytics: AnalyticsService;

    beforeEach(() => {
        jest.clearAllMocks();
        analytics = new AnalyticsService();
    });

    it('should have a posthogClient exported when API key is set', () => {
        // posthogClient is created eagerly at module load
        // In test environment __DEV__ is true so it will be created (but disabled)
        expect(posthogClient).toBeDefined();
    });

    it('should not throw when calling track', () => {
        expect(() => analytics.track('test_event', { foo: 'bar' })).not.toThrow();
    });

    it('should not throw when calling specialized events', () => {
        expect(() => analytics.logAccountCreated('Checking', 'USD')).not.toThrow();
        expect(() => analytics.logOnboardingComplete('USD')).not.toThrow();
        expect(() => analytics.logFactoryReset()).not.toThrow();
    });
});
