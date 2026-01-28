import { database } from '@/src/data/database/Database';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { WealthSummary, wealthService } from '@/src/services/wealth-service';
import { logger } from '@/src/utils/logger';
import { useEffect, useState } from 'react';

export interface DashboardSummaryData extends WealthSummary {
    income: number;
    expense: number;
    isPrivacyMode: boolean;
    isLoading: boolean;
    togglePrivacyMode: () => void;
}

export const useSummary = () => {
    const [data, setData] = useState<Omit<DashboardSummaryData, 'togglePrivacyMode' | 'isPrivacyMode'>>({
        income: 0,
        expense: 0,
        netWorth: 0,
        totalAssets: 0,
        totalLiabilities: 0,
        isLoading: true,
    });
    const [isPrivacyMode, setIsPrivacyMode] = useState(false);

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

    const togglePrivacyMode = () => setIsPrivacyMode(!isPrivacyMode);

    useEffect(() => {
        fetchSummary();

        // Subscribe to changes in journals and transactions
        const journalSubscription = database.collections.get('journals').query().observe().subscribe(() => {
            fetchSummary();
        });

        const transactionSubscription = database.collections.get('transactions').query().observe().subscribe(() => {
            fetchSummary();
        });

        return () => {
            journalSubscription.unsubscribe();
            transactionSubscription.unsubscribe();
        };
    }, []);

    return {
        ...data,
        isPrivacyMode,
        togglePrivacyMode,
    };
};
