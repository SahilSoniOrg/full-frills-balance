import { useUI } from '@/src/contexts/UIContext';
import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { WealthSummary, wealthService } from '@/src/services/wealth-service';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import { useEffect, useRef, useState } from 'react';

export interface DashboardSummaryData extends WealthSummary {
    income: number;
    expense: number;
    isPrivacyMode: boolean;
    isLoading: boolean;
    togglePrivacyMode: () => void;
}

/**
 * Hook for dashboard summary data with net worth, income, and expense
 * 
 * Optimizations:
 * - Debounced recalculation (300ms) to prevent rapid re-renders
 * - Subscribes to accounts + transactions (not journals) for efficiency
 * - Filters out deleted records
 */
export const useSummary = () => {
    const { isPrivacyMode, setPrivacyMode } = useUI();
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [data, setData] = useState<Omit<DashboardSummaryData, 'togglePrivacyMode' | 'isPrivacyMode'>>({
        income: 0,
        expense: 0,
        netWorth: 0,
        totalAssets: 0,
        totalLiabilities: 0,
        isLoading: true,
    });

    const fetchSummary = async () => {
        try {
            const now = new Date();
            const month = now.getMonth();
            const year = now.getFullYear();

            const [monthly, balances] = await Promise.all([
                journalRepository.getMonthlySummary(month, year),
                accountRepository.getAccountBalances()
            ]);

            const wealth = wealthService.calculateSummary(balances);

            setData({
                income: monthly.income,
                expense: monthly.expense,
                ...wealth,
                isLoading: false,
            });
        } catch (error) {
            logger.error('Failed to fetch summary:', error);
            setData(prev => ({ ...prev, isLoading: false }));
        }
    };

    const togglePrivacyMode = () => setPrivacyMode(!isPrivacyMode);

    useEffect(() => {
        // Debounced calculation to match useNetWorth behavior
        const debouncedFetch = () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(fetchSummary, 300);
        };

        // Initial load (immediate, no debounce)
        fetchSummary();

        // Subscribe to account changes (filtered to non-deleted)
        const accountSubscription = database.collections
            .get<Account>('accounts')
            .query(Q.where('deleted_at', Q.eq(null)))
            .observe()
            .subscribe(debouncedFetch);

        // Subscribe to transaction changes (filtered to non-deleted)
        const transactionSubscription = database.collections
            .get<Transaction>('transactions')
            .query(Q.where('deleted_at', Q.eq(null)))
            .observe()
            .subscribe(debouncedFetch);

        return () => {
            accountSubscription.unsubscribe();
            transactionSubscription.unsubscribe();
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return {
        ...data,
        isPrivacyMode,
        togglePrivacyMode,
    };
};
