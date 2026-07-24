import {
  AccountPeriodMetrics,
  transactionRawRepository,
} from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import {
  AccountDelta,
  DailyDelta,
  RebuildTransaction,
  RecurringPattern,
} from '@/src/data/repositories/TransactionTypes';
import {
  AccountId,
  DisplayTransaction,
  JournalId,
  TransactionId,
  WorkplaceId,
} from '@/src/types/domain';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { AccountType } from '@/src/data/models/Account';
import { DateRange } from '@/src/hooks/usePaginatedObservable';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { observeEnrichedJournals } from '../journal/journalEnrichedObserver';

/**
 * LedgerReadService
 *
 * Single canonical facade for querying transaction ledger data across
 * both WatermelonDB ORM queries and raw SQL high-performance read paths.
 */
export class LedgerReadService {
  async getTransactionById(
    workplaceId: WorkplaceId,
    id: TransactionId,
  ): Promise<Transaction | null> {
    return transactionRepository.find(workplaceId, id);
  }

  async getTransactionsByJournal(
    workplaceId: WorkplaceId,
    journalId: JournalId,
  ): Promise<Transaction[]> {
    return transactionRepository.findByJournal(workplaceId, journalId);
  }

  async getTransactionsByJournals(
    workplaceId: WorkplaceId,
    journalIds: JournalId[],
  ): Promise<Transaction[]> {
    return transactionRepository.findByJournals(workplaceId, journalIds);
  }

  async getTransactionsByAccount(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    options?: { limit?: number; dateRange?: DateRange; sortOrder?: 'asc' | 'desc' },
  ): Promise<Transaction[]> {
    return transactionRepository.findByAccount(
      workplaceId,
      accountId,
      options?.limit,
      options?.dateRange,
      options?.sortOrder,
    );
  }

  async getAccountPeriodMetrics(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    startDate: number,
    endDate: number,
    isAssetOrExpense: boolean = true,
  ): Promise<AccountPeriodMetrics> {
    return transactionRawRepository.getAccountPeriodMetricsRaw(
      workplaceId,
      accountId,
      startDate,
      endDate,
      isAssetOrExpense,
    );
  }

  async getBulkAccountPeriodMetrics(
    workplaceId: WorkplaceId,
    accountConfigs: { accountId: AccountId; isAssetOrExpense: boolean }[],
    startDate: number,
    endDate: number,
  ): Promise<Map<string, AccountPeriodMetrics>> {
    return transactionRawRepository.getBulkAccountPeriodMetricsRaw(
      workplaceId,
      accountConfigs,
      startDate,
      endDate,
    );
  }

  async getDailyDeltasGrouped(
    workplaceId: WorkplaceId,
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Promise<DailyDelta[]> {
    return transactionRawRepository.getDailyDeltasGroupedRaw(
      workplaceId,
      accountIds,
      startDate,
      endDate,
    );
  }

  async getAccountDeltasGrouped(
    workplaceId: WorkplaceId,
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Promise<AccountDelta[]> {
    return transactionRawRepository.getAccountDeltasGroupedRaw(
      workplaceId,
      accountIds,
      startDate,
      endDate,
    );
  }

  async getRebuildData(accountId: AccountId, startDate: number): Promise<RebuildTransaction[]> {
    return transactionRawRepository.getRebuildDataRaw(accountId, startDate);
  }

  async getRecurringPatterns(startDate: number, minCount: number): Promise<RecurringPattern[]> {
    return transactionRawRepository.getRecurringPatternsRaw(startDate, minCount);
  }

  observeEnrichedForAccount(
    accountId: AccountId,
    workplaceId: WorkplaceId,
    limit: number,
    dateRange?: DateRange,
  ): Observable<DisplayTransaction[]> {
    return this.observeEnrichedForAccounts([accountId], workplaceId, limit, dateRange);
  }

  observeEnrichedForAccounts(
    accountIds: AccountId[],
    workplaceId: WorkplaceId,
    limit: number,
    dateRange?: DateRange,
  ): Observable<DisplayTransaction[]> {
    const rangeParam = dateRange
      ? {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          accountIds,
        }
      : { accountIds, startDate: 0, endDate: Number.MAX_SAFE_INTEGER };

    return observeEnrichedJournals(workplaceId, limit, rangeParam).pipe(
      map(journals => {
        const displayTxs: DisplayTransaction[] = [];
        for (const j of journals) {
          for (const acc of j.accounts) {
            if (accountIds.includes(acc.id as AccountId)) {
              displayTxs.push({
                id: `${j.id}_${acc.id}` as TransactionId,
                journalId: j.id,
                accountId: acc.id as AccountId,
                amount: j.totalAmount,
                currencyCode: j.currencyCode,
                transactionType:
                  acc.role === 'SOURCE' ? TransactionType.CREDIT : TransactionType.DEBIT,
                transactionDate: j.journalDate,
                notes: j.notes,
                journalDescription: j.description,
                accountName: acc.name,
                accountType: acc.accountType as AccountType,
                icon: acc.icon,
                displayTitle: j.description || 'Transaction',
                displayType: j.displayType,
                isIncrease: acc.role === 'DESTINATION',
              });
            }
          }
        }
        return displayTxs;
      }),
    );
  }
}

export const ledgerReadService = new LedgerReadService();
