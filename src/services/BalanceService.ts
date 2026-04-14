import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { AccountBalance } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Trace, traceService } from '@/src/utils/TraceService';
import { Money, roundToPrecision } from '../utils/money';
import { preferences } from '../utils/preferences';

import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';

interface CachedHierarchy {
  parentIdMap: Map<string, string>;
  depthCache: Map<string, number>;
  levelMap: Map<number, string[]>;
  maxDepth: number;
  accountIds: string; // Serialized list of IDs for cache key
}

export class BalanceService {
  private hierarchyCache: CachedHierarchy | null = null;
  /**
   * Aggregates balances from child accounts to their parents.
   * Supports multi-level hierarchy.
   */
  public async aggregateBalances(
    accounts: Account[],
    balancesMap: Map<string, AccountBalance>,
    accountPrecisionMap: Map<string, number>,
    targetDefaultCurrency: string = preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
    parentTrace?: Trace,
  ) {
    const trace = parentTrace || traceService.startTrace('BalanceService.aggregateBalances');
    try {
      if (accounts.length === 0) return;

      // 1. Build/Retrieve hierarchy (Memoized)
      // Optimization: Sorting and joining IDs is faster than rebuilding the whole tree structure
      const currentAccountIds = accounts
        .map(a => `${a.id}:${a.parentAccountId || ''}`)
        .sort()
        .join('|');

      if (!this.hierarchyCache || this.hierarchyCache.accountIds !== currentAccountIds) {
        this.rebuildHierarchyCache(accounts, currentAccountIds);
      }
      trace.metric('hierarchyBuilt');

      const { parentIdMap, levelMap, maxDepth } = this.hierarchyCache!;

      // 2. Track sub-tree currencies for each parent to determine target currency
      // Optimization: Use a map of sets, but initialize once
      const subTreeCurrencies = new Map<string, Set<string>>();
      accounts.forEach(a => {
        const currencies = new Set<string>();
        const balance = balancesMap.get(a.id);
        if (balance && (balance.balance !== 0 || balance.transactionCount > 0)) {
          currencies.add(balance.currencyCode);
        }
        subTreeCurrencies.set(a.id, currencies);
      });

      // 3. Propagate currency lists up the chain using the level map (Leaf to Root)
      // This is $O(N)$ instead of sorting $O(N log N)$ every time
      for (let d = maxDepth; d > 0; d--) {
        const ids = levelMap.get(d) || [];
        for (const id of ids) {
          const parentId = parentIdMap.get(id);
          if (!parentId) continue;

          const myCurrencies = subTreeCurrencies.get(id);
          const parentCurrencies = subTreeCurrencies.get(parentId);
          if (myCurrencies && parentCurrencies) {
            myCurrencies.forEach(c => parentCurrencies.add(c));
          }
        }
      }

      // 4. Pre-fetch all required exchange rates for the entire hierarchy in parallel
      const uniqueBaseCurrencies = new Set<string>();
      uniqueBaseCurrencies.add(targetDefaultCurrency); // Always pre-fetch default

      for (const account of accounts) {
        const balance = balancesMap.get(account.id);
        if (balance) {
          uniqueBaseCurrencies.add(balance.currencyCode);
        }
      }

      // 4. Background Fetch: Trigger required rates in background (Non-Blocking)
      // We don't await here because we want the UI to render instantly.
      // Reactive updates are handled via ReactiveDataService observing exchangeRateRepository.
      Array.from(uniqueBaseCurrencies).forEach(base => {
        exchangeRateService.fetchRatesForBase(base).catch(err => {
          logger.error(`[Trace] Background rate fetch failed for ${base}:`, err);
        });
      });

      // 7. Aggregate leaf-to-root, level by level (Synchronous execution)
      for (let d = maxDepth; d > 0; d--) {
        const accountIdsAtLevel = levelMap.get(d) || [];

        for (const accountId of accountIdsAtLevel) {
          const parentId = parentIdMap.get(accountId);
          if (!parentId) continue;

          const myBalance = balancesMap.get(accountId);
          const parentBalance = balancesMap.get(parentId);
          if (
            !myBalance ||
            !parentBalance ||
            (myBalance.balance === 0 && myBalance.transactionCount === 0)
          )
            continue;

          const pCurrencies = subTreeCurrencies.get(parentId);
          let targetCurrency = parentBalance.currencyCode;

          if (pCurrencies && pCurrencies.size === 1) {
            targetCurrency = Array.from(pCurrencies)[0] || parentBalance.currencyCode;
          } else if (pCurrencies && pCurrencies.size > 1) {
            targetCurrency = targetDefaultCurrency;
          }

          parentBalance.currencyCode = targetCurrency;

          const precision = accountPrecisionMap.get(parentId) ?? AppConfig.defaultCurrencyPrecision;

          const myBalanceMoney = Money.from(myBalance.balance, myBalance.currencyCode);
          const myIncomeMoney = Money.from(myBalance.monthlyIncome, myBalance.currencyCode);
          const myExpensesMoney = Money.from(myBalance.monthlyExpenses, myBalance.currencyCode);

          let convertedBalance = myBalanceMoney;
          let convertedIncome = myIncomeMoney;
          let convertedExpenses = myExpensesMoney;

          if (myBalance.currencyCode !== targetCurrency) {
            // FAST: getRateSafe hits memory cache pre-warmed by fetchRatesForBase
            const rate = exchangeRateService.getRateSafe(myBalance.currencyCode, targetCurrency);

            convertedBalance = Money.from(myBalance.balance * rate, targetCurrency);
            convertedIncome = Money.from(myBalance.monthlyIncome * rate, targetCurrency);
            convertedExpenses = Money.from(myBalance.monthlyExpenses * rate, targetCurrency);

            // Track mixed child balances for UI "Multi-currency" indicator
            if (!parentBalance.childBalances) parentBalance.childBalances = [];
            const existing = parentBalance.childBalances.find(
              cb => cb.currencyCode === myBalance.currencyCode,
            );
            if (existing) {
              existing.balance = roundToPrecision(existing.balance + myBalance.balance, precision);
            } else {
              parentBalance.childBalances.push({
                currencyCode: myBalance.currencyCode,
                balance: myBalance.balance,
                transactionCount: myBalance.transactionCount,
              });
            }
          }

          const parentBalanceMoney = Money.from(parentBalance.balance, targetCurrency);
          const parentIncomeMoney = Money.from(parentBalance.monthlyIncome, targetCurrency);
          const parentExpensesMoney = Money.from(parentBalance.monthlyExpenses, targetCurrency);

          parentBalance.balance = parentBalanceMoney.add(convertedBalance).round(precision).amount;
          parentBalance.monthlyIncome = parentIncomeMoney
            .add(convertedIncome)
            .round(precision).amount;
          parentBalance.monthlyExpenses = parentExpensesMoney
            .add(convertedExpenses)
            .round(precision).amount;
          parentBalance.transactionCount += myBalance.transactionCount;
        }
      }
      trace.metric('aggregationComplete');
    } catch (error) {
      logger.error('Failed to aggregate balances:', error);
      throw error;
    } finally {
      if (!parentTrace) trace.end();
    }
  }

  private rebuildHierarchyCache(accounts: Account[], accountIdsKey: string) {
    const parentIdMap = new Map<string, string>();
    accounts.forEach(a => {
      if (a.parentAccountId) parentIdMap.set(a.id, a.parentAccountId);
    });

    const depthCache = new Map<string, number>();
    const levelMap = new Map<number, string[]>();
    let maxDepth = 0;

    const getDepth = (id: string): number => {
      if (depthCache.has(id)) return depthCache.get(id)!;
      const path: string[] = [];
      let current = id;
      while (current) {
        if (path.includes(current)) return 0; // Cycle
        if (depthCache.has(current)) {
          let d = depthCache.get(current)!;
          for (let i = path.length - 1; i >= 0; i--) depthCache.set(path[i], ++d);
          return depthCache.get(id)!;
        }
        path.push(current);
        current = parentIdMap.get(current) || '';
      }
      for (let i = path.length - 1; i >= 0; i--) depthCache.set(path[i], path.length - i - 1);
      return depthCache.get(id)!;
    };

    accounts.forEach(a => {
      const d = getDepth(a.id);
      if (d > maxDepth) maxDepth = d;
      if (!levelMap.has(d)) levelMap.set(d, []);
      levelMap.get(d)!.push(a.id);
    });

    this.hierarchyCache = {
      parentIdMap,
      depthCache,
      levelMap,
      maxDepth,
      accountIds: accountIdsKey,
    };
  }

  /**
   * Returns an account's balance and transaction count as of a given date.
   * Logic integrated with snapshots and drift tracking.
   */
  async getAccountBalance(
    accountId: string,
    cutoffDate: number = Number.MAX_SAFE_INTEGER,
  ): Promise<AccountBalance> {
    const account = await accountRepository.find(accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    const latestTx = await transactionRepository.findLatestForAccount(accountId, cutoffDate);

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

    const snapshot = await balanceSnapshotRepository.findLatestForAccount(accountId, cutoffDate);
    let baseCount = 0;
    if (snapshot) {
      baseCount = snapshot.transactionCount;
    }

    const deltaCount = await transactionRawRepository.getAccountTransactionCountsRaw(
      [
        {
          accountId,
          startDate: snapshot?.transactionDate || 0,
          afterTransactionId: snapshot?.transactionId,
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
    asOfDate?: number,
    targetDefaultCurrency: string = preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
    parentTrace?: Trace,
  ): Promise<AccountBalance[]> {
    const trace = parentTrace || traceService.startTrace('BalanceService.getAccountBalances');
    try {
      const accounts = await accountRepository.findAll();
      if (accounts.length === 0) return [];
      trace.metric('fetchAccounts');

      const cutoffDate = asOfDate ?? Number.MAX_SAFE_INTEGER;
      const accountIds = accounts.map(a => a.id);

      // Phase 1: Metadata & Snapshots (Parallel)
      const [latestSnapshotsMap, currencyPrecisionMap] = await Promise.all([
        balanceSnapshotRepository.findLatestForAccountsRaw(accountIds, cutoffDate),
        currencyRepository.getAllPrecisions(),
      ]);
      trace.metric('fetchMetadata');

      // Calculate minTransactionDate pruning hint for Phase 2
      let minSnapshotDate: number | undefined;
      const countInput = accounts.map(a => {
        const snapshot = latestSnapshotsMap.get(a.id);
        if (snapshot) {
          if (minSnapshotDate === undefined || snapshot.transactionDate < minSnapshotDate) {
            minSnapshotDate = snapshot.transactionDate;
          }
        }
        return {
          accountId: a.id,
          startDate: snapshot?.transactionDate || 0,
          afterTransactionId: snapshot?.transactionId,
          afterTransactionDate: snapshot?.transactionDate,
          afterTransactionCreatedAt: snapshot?.transactionCreatedAt,
        };
      });

      // Phase 2: Latest Balances & Transaction Counts (Parallel)
      const [latestBalancesMap, deltaCountsMap] = await Promise.all([
        transactionRawRepository.getLatestBalancesRaw(accountIds, cutoffDate),
        transactionRawRepository.getAccountTransactionCountsRaw(
          countInput,
          cutoffDate,
          minSnapshotDate,
        ),
      ]);
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

      const precisionMap = new Map<string, number>();
      for (const account of accounts) {
        const precision =
          currencyPrecisionMap.get(account.currencyCode) ?? AppConfig.defaultCurrencyPrecision;
        precisionMap.set(account.id, precision);
      }

      await this.aggregateBalances(
        accounts,
        balancesMap,
        precisionMap,
        targetDefaultCurrency,
        trace,
      );
      trace.metric('aggregate');

      return Array.from(balancesMap.values());
    } catch (error) {
      logger.error('Failed to get account balances:', error);
      throw error;
    } finally {
      if (!parentTrace) trace.end();
    }
  }
}

export const balanceService = new BalanceService();
