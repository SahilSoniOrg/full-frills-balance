import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { AppConfig } from '@/src/constants';
import { ledgerReadService } from '@/src/services/ledger/ledgerReadService';
import { EnrichedTransaction } from '@/src/types/domain';
import { useCallback } from 'react';

export function useLedgerTransactionsForAccount(
    accountId: string,
    pageSize: number = AppConfig.defaults.journalPageSize,
    dateRange?: { startDate: number; endDate: number },
) {
    const observe = useCallback(
        (limit: number, range?: { startDate: number; endDate: number }) => {
            return ledgerReadService.observeEnrichedForAccount(accountId, limit, range);
        },
        [accountId],
    );

    const { items: transactions, isLoading, isLoadingMore, hasMore, loadMore, version } = usePaginatedObservable<EnrichedTransaction>({
        pageSize,
        dateRange,
        observe,
    });

    return { transactions, isLoading, isLoadingMore, hasMore, loadMore, version };
}
