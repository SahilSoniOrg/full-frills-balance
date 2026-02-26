import { AppConfig } from '@/src/constants/app-config';
import { ImportStats } from '@/src/services/import';
import { logger } from '@/src/utils/logger';
import PostHog from 'posthog-react-native';

/**
 * Analytics Service
 * 
 * Provides a privacy-first, lightweight wrapper for tracking usage patterns.
 * Powered by PostHog.
 */

// PostHog configuration — evaluated at module load so the client is ready immediately
const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

/**
 * Singleton PostHog client shared by both PostHogProvider (in RootLayout)
 * and AnalyticsService (for service-layer tracking).
 * Exported so RootLayout can pass it via `client={posthogClient}`.
 */
export const posthogClient = POSTHOG_API_KEY
    ? new PostHog(POSTHOG_API_KEY, {
        host: POSTHOG_HOST,
    })
    : null;

export class AnalyticsService {
    /**
     * Initialize analytics provider. No-op since the client is created eagerly;
     * kept for call-site compatibility.
     */
    initialize() {
        if (posthogClient && __DEV__) {
            logger.info('[Analytics] PostHog client ready (debug mode — events disabled in __DEV__)');
        } else if (posthogClient) {
            logger.info('[Analytics] PostHog client ready');
        } else {
            logger.warn('[Analytics] No PostHog API key configured — analytics disabled');
        }
    }

    /**
     * Track a custom event
     */
    track(eventName: string, props?: Record<string, string | number | boolean>) {
        if (!posthogClient) return;

        try {
            posthogClient.capture(eventName, props);
            if (__DEV__) {
                logger.debug(`[Analytics] Tracked: ${eventName}`, props);
            }
        } catch (error) {
            logger.error(`[Analytics] Failed to track event: ${eventName}`, error);
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

    logError(error: Error, componentStack?: string) {
        const trimLimit = AppConfig.constants.validation.maxTrimLength;
        this.track('app_error', {
            name: error.name,
            message: error.message,
            stack: error.stack?.slice(0, trimLimit) || 'no-stack', // Trim long stacks
            componentStack: componentStack?.slice(0, trimLimit) || 'no-component-stack'
        });
    }
}

export const analytics = new AnalyticsService();
