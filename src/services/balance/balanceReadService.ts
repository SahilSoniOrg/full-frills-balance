import { AppConfig } from '@/src/constants/app-config';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AccountBalance, AccountId, AccountType, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Trace, traceService } from '@/src/utils/TraceService';
import { balanceHierarchyAggregator } from './balanceHierarchyAggregator';

export class BalanceReadService {
  /**
   * Returns an account's balance and transaction count as of a given date.
   * Logic integrated with snapshots and drift tracking.
   */
  async getAccountBalance(
    accountId: AccountId,
    workplaceId: WorkplaceId,
    cutoffDate: number = Number.MAX_SAFE_INTEGER,
  ): Promise<AccountBalance> {
    const account = await accountQueryRepository.find(workplaceId, accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    const latestTx = await transactionQueryRepository.findLatestForAccount(
      workplaceId,
      accountId,
      cutoffDate,
    );

    if (!latestTx) {
      return {
        accountId: account.id,
        balance: 0,
        directBalance: 0,
        currencyCode: account.currencyCode,
        transactionCount: 0,
        directTransactionCount: 0,
        asOfDate: cutoffDate,
        accountType: account.accountType as AccountType,
        monthlyIncome: 0,
        monthlyExpenses: 0,
      };
    }

    const snapshot = await balanceSnapshotRepository.findLatestForAccount(
      workplaceId,
      accountId,
      cutoffDate,
    );
    let baseCount = 0;
    if (snapshot) {
      baseCount = snapshot.transactionCount;
    }

    const deltaCount = await transactionRawRepository.getAccountTransactionCountsRaw(
      workplaceId,
      [
        {
          accountId,
          startDate: snapshot?.transactionDate || 0,
          afterTransactionId: snapshot?.transactionId,
          afterTransactionDate: snapshot?.transactionDate,
        },
      ],
      cutoffDate,
    );

    const totalCount = baseCount + (deltaCount.get(accountId) || 0);

    return {
      accountId: account.id,
      balance: latestTx.runningBalance || 0,
      directBalance: latestTx.runningBalance || 0,
      currencyCode: account.currencyCode,
      transactionCount: totalCount,
      directTransactionCount: totalCount,
      asOfDate: cutoffDate,
      accountType: account.accountType as AccountType,
      monthlyIncome: 0,
      monthlyExpenses: 0,
    };
  }

  /**
   * Gets balances for all active accounts in batch.
   */
  async getAccountBalances(
    workplaceId: WorkplaceId,
    asOfDate?: number,
    targetDefaultCurrency?: string,
    parentTrace?: Trace,
  ): Promise<AccountBalance[]> {
    const start = performance.now();
    const trace = parentTrace || traceService.startTrace('BalanceReadService.getAccountBalances');
    try {
      const accounts = await accountQueryRepository.findAll(workplaceId);
      if (accounts.length === 0) return [];
      trace.metric('fetchAccounts');

      const cutoffDate = asOfDate ?? Number.MAX_SAFE_INTEGER;
      const accountIds = accounts.map(a => a.id);

      if (!targetDefaultCurrency) {
        targetDefaultCurrency = await workplaceService.getCurrency(workplaceId);
      }

      // Phase 1: Metadata & Snapshots (Parallel)
      const [latestSnapshotsMap, currencyPrecisionMap] = await Promise.all([
        balanceSnapshotRepository.findLatestForAccountsRaw(workplaceId, accountIds, cutoffDate),
        currencyReadService.getAllPrecisions(),
      ]);
      trace.metric('fetchMetadata');

      const countInput = accounts.map(a => {
        const snapshot = latestSnapshotsMap.get(a.id);
        return {
          accountId: a.id,
          startDate: snapshot?.transactionDate || 0,
          afterTransactionId: snapshot?.transactionId,
          afterTransactionDate: snapshot?.transactionDate,
          afterTransactionCreatedAt: snapshot?.transactionCreatedAt,
        };
      });

      // Phase 2: Latest Balances & Transaction Counts (Single Pass Optimization)
      const { balances: latestBalancesMap, counts: deltaCountsMap } =
        await transactionRawRepository.getLatestBalancesAndCountsRaw(
          workplaceId,
          countInput,
          cutoffDate,
        );
      trace.metric('fetchData');

      // 5. Map results to AccountBalance objects
      const balances = accounts.map(account => {
        const snapshot = latestSnapshotsMap.get(account.id);
        const baseCount = snapshot?.transactionCount || 0;
        const deltaCount = deltaCountsMap.get(account.id) || 0;
        const totalCount = baseCount + deltaCount;
        const balanceValue = latestBalancesMap.get(account.id) || 0;

        return {
          accountId: account.id,
          balance: balanceValue,
          directBalance: balanceValue,
          currencyCode: account.currencyCode,
          transactionCount: totalCount,
          directTransactionCount: totalCount,
          asOfDate: cutoffDate,
          accountType: account.accountType as AccountType,
          monthlyIncome: 0,
          monthlyExpenses: 0,
        } as AccountBalance;
      });

      const balancesMap = new Map(balances.map(b => [b.accountId, b]));

      await balanceHierarchyAggregator.aggregateBalances(
        accounts,
        balancesMap,
        currencyPrecisionMap,
        targetDefaultCurrency,
        trace,
      );
      trace.metric('aggregate');

      const duration = Math.round(performance.now() - start);
      if (duration > AppConfig.performance.slowBalanceThresholdMs) {
        logger.info(
          `[BalanceReadService] getAccountBalances took ${duration}ms (${accounts.length} accounts)`,
        );
      }

      return Array.from(balancesMap.values());
    } catch (error) {
      logger.error('Failed to get account balances:', error);
      throw error;
    } finally {
      if (!parentTrace) trace.end();
    }
  }
}

export const balanceReadService = new BalanceReadService();
