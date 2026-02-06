import { UIConstants } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { useUI } from '@/src/contexts/UIContext';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { useObservable } from '@/src/hooks/useObservable';
import { reportService } from '@/src/services/report-service';
import { logger } from '@/src/utils/logger';
import { combineLatest, debounceTime, switchMap } from 'rxjs';

interface MonthlyFlow {
    income: number;
    expense: number;
}

/**
 * Specialized hook for monthly income and expense flow.
 */
export function useMonthlyFlow(): MonthlyFlow & { isLoading: boolean } {
    const { defaultCurrency } = useUI();

    const { data, isLoading } = useObservable<MonthlyFlow>(
        () => combineLatest([
            accountRepository.observeAll(),
            transactionRepository.observeActiveWithColumns([
                'amount',
                'transaction_type',
                'transaction_date',
                'currency_code',
                'exchange_rate'
            ])
        ]).pipe(
            debounceTime(UIConstants.animation.dataRefreshDebounce),
            switchMap(async ([accounts, transactions]) => {
                try {
                    const now = new Date();
                    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
                    const targetCurrency = defaultCurrency || AppConfig.defaultCurrency;

                    return await reportService.getIncomeVsExpenseFromTransactions(
                        transactions,
                        accounts,
                        startOfMonth,
                        endOfMonth,
                        targetCurrency
                    );
                } catch (error) {
                    logger.error('Failed to calculate monthly flow:', error);
                    return { income: 0, expense: 0 };
                }
            })
        ),
        [defaultCurrency],
        { income: 0, expense: 0 }
    );

    return {
        ...data,
        isLoading
    };
}
