import { ImportStats } from '@/src/services/import';
import { logger } from '@/src/utils/logger';
import { init, trackEvent } from '@aptabase/react-native';

/**
 * Analytics Service
 * 
 * Provides a privacy-first, lightweight wrapper for tracking usage patterns.
 * Powered by Aptabase.
 */

// Expo environment variable (must be prefixed with EXPO_PUBLIC_)
const APTABASE_KEY = process.env.EXPO_PUBLIC_APTABASE_KEY || '';

export class AnalyticsService {
    private isInitialized = false;

    /**
     * Initialize analytics provider
     */
    initialize() {
        if (this.isInitialized) return;

        try {
            init(APTABASE_KEY);
            this.isInitialized = true;
            logger.info('[Analytics] Initialized with Aptabase');
        } catch (error) {
            logger.error('[Analytics] Initialization failed', error);
        }
    }

    /**
     * Track a custom event
     */
    track(eventName: string, props?: Record<string, string | number | boolean>) {
        if (!this.isInitialized) return;

        try {
            trackEvent(eventName, props);
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

    logTransactionCreated(mode: 'simple' | 'advanced', type: string, currency: string) {
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
        this.track('app_error', {
            name: error.name,
            message: error.message,
            stack: error.stack?.slice(0, 500) || 'no-stack', // Trim long stacks
            componentStack: componentStack?.slice(0, 500) || 'no-component-stack'
        });
    }
}

export const analytics = new AnalyticsService();
