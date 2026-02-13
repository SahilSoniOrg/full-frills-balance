import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountType } from '@/src/data/models/Account';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { preferences } from '@/src/utils/preferences';

export interface ExpenseCategory {
    accountId: string;
    accountName: string;
    amount: number;
    percentage: number;
    color?: string; // For chart
}

export interface IncomeVsExpense {
    period: string; // Label (e.g., "Jan", "Week 1")
    income: number;
    expense: number;
}

export class ReportService {
    /**
     * Aggregates expenses by account for a period.
     */
    async getExpenseBreakdown(startDate: number, endDate: number, targetCurrency?: string): Promise<ExpenseCategory[]> {
        const currency = targetCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
        const expenseAccounts = await accountRepository.findByType(AccountType.EXPENSE);
        if (expenseAccounts.length === 0) return [];

        const accountIds = expenseAccounts.map(a => a.id);
        const transactions = await transactionRepository.findByAccountsAndDateRange(accountIds, startDate, endDate);

        const sums = new Map<string, number>();
        let totalExpense = 0;

        for (const tx of transactions) {
            const txCurrency = tx.currencyCode || currency;
            const { convertedAmount } = await exchangeRateService.convert(
                tx.amount,
                txCurrency,
                currency
            );

            const current = sums.get(tx.accountId) || 0;
            const change = tx.transactionType === TransactionType.DEBIT ? convertedAmount : -convertedAmount;
            sums.set(tx.accountId, current + change);
            totalExpense += change;
        }

        const result: ExpenseCategory[] = [];
        expenseAccounts.forEach(acc => {
            const amount = sums.get(acc.id) || 0;
            if (amount > 0) {
                result.push({
                    accountId: acc.id,
                    accountName: acc.name,
                    amount,
                    percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0
                });
            }
        });

        return result.sort((a, b) => b.amount - a.amount);
    }

    /**
     * Calculates Income vs Expense for the period.
     */
    async getIncomeVsExpense(startDate: number, endDate: number, targetCurrency?: string): Promise<{ income: number, expense: number }> {
        const currency = targetCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
        const incomeAccounts = await accountRepository.findByType(AccountType.INCOME);
        const expenseAccounts = await accountRepository.findByType(AccountType.EXPENSE);

        const allReportAccounts = [...incomeAccounts, ...expenseAccounts];
        const accountIds = allReportAccounts.map(a => a.id);

        const transactions = await transactionRepository.findByAccountsAndDateRange(accountIds, startDate, endDate);

        return this.getIncomeVsExpenseFromTransactions(transactions, allReportAccounts, startDate, endDate, currency);
    }

    /**
     * Calculates Income vs Expense from an in-memory transaction list.
     * Useful for reactive hooks that already subscribe to transactions.
     */
    async getIncomeVsExpenseFromTransactions(
        transactions: Transaction[],
        accounts: Account[],
        startDate: number,
        endDate: number,
        targetCurrency?: string
    ): Promise<{ income: number, expense: number }> {
        const currency = targetCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
        const accountMap = new Map(accounts.map(a => [a.id, a]));

        let income = 0;
        let expense = 0;

        const conversions = await Promise.all(transactions.map(async (tx) => {
            if (tx.transactionDate < startDate || tx.transactionDate > endDate) return null;
            const acc = accountMap.get(tx.accountId);
            if (!acc) return null;
            if (acc.accountType !== AccountType.INCOME && acc.accountType !== AccountType.EXPENSE) return null;

            const txCurrency = tx.currencyCode || acc.currencyCode || currency;
            const { convertedAmount } = await exchangeRateService.convert(
                tx.amount,
                txCurrency,
                currency
            );

            return {
                amount: convertedAmount,
                type: acc.accountType,
                transactionType: tx.transactionType
            };
        }));

        for (const conv of conversions) {
            if (!conv) continue;
            if (conv.type === AccountType.INCOME) {
                income += conv.transactionType === TransactionType.CREDIT ? conv.amount : -conv.amount;
            } else {
                expense += conv.transactionType === TransactionType.DEBIT ? conv.amount : -conv.amount;
            }
        }

        return { income, expense };
    }
}

export const reportService = new ReportService();
