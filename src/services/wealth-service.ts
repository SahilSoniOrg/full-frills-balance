import { AccountType } from '@/src/data/models/Account';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { AccountBalance } from '@/src/types/domain';

export interface WealthSummary {
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalIncome: number;
    totalExpense: number;
}

/**
 * WealthService - Pure logic for calculating wealth metrics.
 * Follows Rule 1.3: Data-Driven UI (Database is source of truth, service interprets it).
 */
export const wealthService = {
    /**
     * Calculates net worth and category totals from account balances,
     * converting all amounts to the specified target currency.
     */
    async calculateSummary(balances: AccountBalance[], targetCurrency: string): Promise<WealthSummary> {
        let totalAssets = 0;
        let totalLiabilities = 0;
        let totalEquity = 0;
        let totalIncome = 0;
        let totalExpense = 0;

        // Process conversions in parallel for better performance
        await Promise.all(balances.map(async b => {
            const balanceCurrency = b.currencyCode || targetCurrency;
            const { convertedAmount } = await exchangeRateService.convert(
                b.balance,
                balanceCurrency,
                targetCurrency
            );

            if (b.accountType === AccountType.ASSET) {
                totalAssets += convertedAmount;
            } else if (b.accountType === AccountType.LIABILITY) {
                totalLiabilities += convertedAmount;
            } else if (b.accountType === AccountType.EQUITY) {
                totalEquity += convertedAmount;
            } else if (b.accountType === AccountType.INCOME) {
                totalIncome += convertedAmount;
            } else if (b.accountType === AccountType.EXPENSE) {
                totalExpense += convertedAmount;
            }
        }));

        return {
            totalAssets,
            totalLiabilities,
            totalEquity,
            totalIncome,
            totalExpense,
            netWorth: (totalAssets + totalIncome + totalEquity) - (totalLiabilities + totalExpense),
        };
    }
};
