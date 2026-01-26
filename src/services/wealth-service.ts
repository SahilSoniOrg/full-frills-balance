import { AccountType } from '@/src/data/models/Account';
import { AccountBalance } from '@/src/types/domain';

export interface WealthSummary {
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
}

/**
 * WealthService - Pure logic for calculating wealth metrics.
 * Follows Rule 1.3: Data-Driven UI (Database is source of truth, service interprets it).
 */
export const wealthService = {
    /**
     * Calculates net worth, total assets, and total liabilities from account balances.
     */
    calculateSummary(balances: AccountBalance[]): WealthSummary {
        let totalAssets = 0;
        let totalLiabilities = 0;

        balances.forEach(b => {
            // Standard accounting: Net Worth = Assets - Liabilities
            if (b.accountType === AccountType.ASSET) {
                totalAssets += b.balance;
            } else if (b.accountType === AccountType.LIABILITY) {
                totalLiabilities += b.balance;
            }
        });

        return {
            totalAssets,
            totalLiabilities,
            netWorth: totalAssets - totalLiabilities,
        };
    }
};
