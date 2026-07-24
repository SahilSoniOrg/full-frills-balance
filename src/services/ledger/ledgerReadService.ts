import { DateRange } from '@/src/hooks/usePaginatedObservable';
import {
  observeDisplayTransactionsForAccount,
  observeDisplayTransactionsForAccounts,
} from '@/src/services/ledger/ledgerEnrichedDisplay';
import { AccountId, DisplayTransaction, WorkplaceId } from '@/src/types/domain';
import { Observable } from 'rxjs';

/**
 * Ledger read Module for enriched journal → display transaction streams.
 * Raw SQL / repository mirrors live on TransactionRawRepository and repos directly.
 */
export class LedgerReadService {
  observeEnrichedForAccount(
    accountId: AccountId,
    workplaceId: WorkplaceId,
    limit: number,
    dateRange?: DateRange,
  ): Observable<DisplayTransaction[]> {
    return observeDisplayTransactionsForAccount(accountId, workplaceId, limit, dateRange);
  }

  observeEnrichedForAccounts(
    accountIds: AccountId[],
    workplaceId: WorkplaceId,
    limit: number,
    dateRange?: DateRange,
  ): Observable<DisplayTransaction[]> {
    return observeDisplayTransactionsForAccounts(accountIds, workplaceId, limit, dateRange);
  }
}

export const ledgerReadService = new LedgerReadService();
