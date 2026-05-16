import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AccountBalance, AccountId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Trace, traceService } from '@/src/utils/TraceService';
import { Money } from '../utils/money';

import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';

interface CachedHierarchy {
  parentIdMap: Map<string, string>;
  depthCache: Map<string, number>;
  levelMap: Map<number, string[]>;
  maxDepth: number;
  fingerprint: string; // 100% Deterministic string hash for cache key
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
    currencyPrecisionMap: Map<string, number>,
    targetDefaultCurrency?: string,
    parentTrace?: Trace,
  ) {
    const start = performance.now();
    const trace = parentTrace || traceService.startTrace('BalanceService.aggregateBalances');
    try {
      if (accounts.length === 0) return;

      if (!targetDefaultCurrency) {
        targetDefaultCurrency = await workplaceService.getCurrency(accounts[0].workplaceId);
      }

      // 1. Build/Retrieve hierarchy (Memoized)
      // Optimization: String serialization for absolute collision resistance
      const fingerPrint = accounts
        .map(a => `${a.id}:${a.parentAccountId || ''}:${a.updatedAt?.getTime() || 0}`)
        .sort()
        .join('|');

      if (!this.hierarchyCache || this.hierarchyCache.fingerprint !== fingerPrint) {
        this.rebuildHierarchyCache(accounts, fingerPrint);
      }
      trace.metric('hierarchyBuilt');

      const { parentIdMap, levelMap, maxDepth } = this.hierarchyCache!;

      // 2. Track sub-tree currencies for each parent to determine target currency
      // Optimization: Lazy allocation - Store string for single currency, Set for multiple
      const subTreeCurrencies = new Map<string, Set<string> | string>();
      for (const a of accounts) {
        const balance = balancesMap.get(a.id);
        if (balance && (balance.balance !== 0 || balance.transactionCount > 0)) {
          subTreeCurrencies.set(a.id, balance.currencyCode);
        }
      }

      // 3. Propagate currency lists up the chain using the level map (Leaf to Root)
      for (let d = maxDepth; d > 0; d--) {
        const ids = levelMap.get(d) || [];
        for (const id of ids) {
          const parentId = parentIdMap.get(id);
          if (!parentId) continue;

          const myData = subTreeCurrencies.get(id);
          if (!myData) continue;

          const parentData = subTreeCurrencies.get(parentId);
          if (!parentData) {
            // Clone if it's a Set to prevent reference sharing across branches
            subTreeCurrencies.set(parentId, myData instanceof Set ? new Set(myData) : myData);
          } else if (parentData instanceof Set) {
            if (myData instanceof Set) {
              myData.forEach(c => parentData.add(c));
            } else {
              parentData.add(myData);
            }
          } else if (parentData !== myData) {
            // Upgrade to Set
            const newSet = new Set<string>([parentData]);
            if (myData instanceof Set) {
              myData.forEach(c => newSet.add(c));
            } else {
              newSet.add(myData);
            }
            subTreeCurrencies.set(parentId, newSet);
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

      // 5. Staged aggregation setup (Transactional read consistency)
      // We aggregate into a separate structure to avoid exposing half-baked states to reactive readers.
      const stagedResults = new Map<
        string,
        {
          balance: number;
          monthlyIncome: number;
          monthlyExpenses: number;
          transactionCount: number;
          currencyCode: string;
          childBalancesMap: Map<
            string,
            { currencyCode: string; balance: number; transactionCount: number }
          >;
        }
      >();

      for (const b of balancesMap.values()) {
        stagedResults.set(b.accountId, {
          balance: b.balance,
          monthlyIncome: b.monthlyIncome,
          monthlyExpenses: b.monthlyExpenses,
          transactionCount: b.transactionCount,
          currencyCode: b.currencyCode,
          childBalancesMap: new Map(),
        });
      }

      // 6. Aggregate leaf-to-root, level by level (Synchronous execution)
      for (let d = maxDepth; d > 0; d--) {
        const accountIdsAtLevel = levelMap.get(d) || [];

        for (const accountId of accountIdsAtLevel) {
          const parentId = parentIdMap.get(accountId);
          if (!parentId) continue;

          const myBalance = balancesMap.get(accountId);
          const parentBalance = balancesMap.get(parentId);
          if (!myBalance || !parentBalance) continue;

          const parentStaged = stagedResults.get(parentId);
          if (!parentStaged) continue;

          const targetCurrency = parentStaged.currencyCode;

          const pData = subTreeCurrencies.get(parentId);
          let effectiveCurrency = targetCurrency;

          if (typeof pData === 'string') {
            effectiveCurrency = pData;
          } else if (pData instanceof Set) {
            // Optimization: Zero-allocation set peeking
            // If the set has exactly one currency, use it. Otherwise, fallback to the target default.
            const firstCurrency = pData.values().next().value;
            effectiveCurrency =
              pData.size === 1 && typeof firstCurrency === 'string'
                ? firstCurrency
                : targetDefaultCurrency;
          }

          // Stage currency alongside numeric values — never mutate live balance objects mid-aggregation
          parentStaged.currencyCode = effectiveCurrency;

          const precision =
            currencyPrecisionMap.get(effectiveCurrency) ?? AppConfig.defaultCurrencyPrecision;

          const myStaged = stagedResults.get(accountId);
          if (!myStaged) continue;
          const myBalanceMoney = Money.from(myStaged.balance, myBalance.currencyCode);
          const myIncomeMoney = Money.from(myStaged.monthlyIncome, myBalance.currencyCode);
          const myExpensesMoney = Money.from(myStaged.monthlyExpenses, myBalance.currencyCode);

          let convertedBalance = myBalanceMoney;
          let convertedIncome = myIncomeMoney;
          let convertedExpenses = myExpensesMoney;

          if (myBalance.currencyCode !== effectiveCurrency) {
            // FAST: getRateSafe hits memory cache pre-warmed by fetchRatesForBase
            const rate = exchangeRateService.getRateSafe(myBalance.currencyCode, effectiveCurrency);

            // FX Integrity Guard: Fail fast if an exchange rate is invalid to prevent corrupted totals
            if (!rate || rate <= 0) {
              throw new Error(
                `[BalanceService] Missing or invalid exchange rate for ${myBalance.currencyCode} -> ${effectiveCurrency}`,
              );
            }

            convertedBalance = Money.from(myStaged.balance * rate, effectiveCurrency);
            convertedIncome = Money.from(myStaged.monthlyIncome * rate, effectiveCurrency);
            convertedExpenses = Money.from(myStaged.monthlyExpenses * rate, effectiveCurrency);

            // Track mixed child balances (O(1) Map lookup instead of O(N) find)
            const existing = parentStaged.childBalancesMap.get(myBalance.currencyCode);
            if (existing) {
              const childPrecision =
                currencyPrecisionMap.get(myBalance.currencyCode) ??
                AppConfig.defaultCurrencyPrecision;
              existing.balance = Money.from(existing.balance, myBalance.currencyCode)
                .add(Money.from(myStaged.balance, myBalance.currencyCode))
                .round(childPrecision).amount;
            } else {
              parentStaged.childBalancesMap.set(myBalance.currencyCode, {
                currencyCode: myBalance.currencyCode,
                balance: myStaged.balance,
                transactionCount: myStaged.transactionCount,
              });
            }
          }

          const parentBalanceMoney = Money.from(parentStaged.balance, effectiveCurrency);
          const parentIncomeMoney = Money.from(parentStaged.monthlyIncome, effectiveCurrency);
          const parentExpensesMoney = Money.from(parentStaged.monthlyExpenses, effectiveCurrency);

          parentStaged.balance = parentBalanceMoney.add(convertedBalance).round(precision).amount;
          parentStaged.monthlyIncome = parentIncomeMoney
            .add(convertedIncome)
            .round(precision).amount;
          parentStaged.monthlyExpenses = parentExpensesMoney
            .add(convertedExpenses)
            .round(precision).amount;
          parentStaged.transactionCount += myStaged.transactionCount;
        }
      }

      // 7. Commit staged results to the main balances map in a synchronous pass
      // This pattern ensures that any parallel readers never see half-aggregated states.
      for (const [id, staging] of stagedResults) {
        const balance = balancesMap.get(id);
        if (balance) {
          balance.currencyCode = staging.currencyCode;
          balance.balance = staging.balance;
          balance.monthlyIncome = staging.monthlyIncome;
          balance.monthlyExpenses = staging.monthlyExpenses;
          balance.transactionCount = staging.transactionCount;
          balance.childBalances = Array.from(staging.childBalancesMap.values());
        }
      }

      trace.metric('aggregationComplete');
    } catch (error) {
      logger.error('Failed to aggregate balances:', error);
      throw error;
    } finally {
      if (!parentTrace) {
        trace.end();
        const duration = Math.round(performance.now() - start);
        if (duration > AppConfig.performance.slowAggregateThresholdMs) {
          logger.info(`[BalanceService] aggregateBalances took ${duration}ms`);
        }
      }
    }
  }

  private rebuildHierarchyCache(accounts: Account[], fingerprint: string) {
    const parentIdMap = new Map<string, string>();
    accounts.forEach(a => {
      if (a.parentAccountId) parentIdMap.set(a.id, a.parentAccountId);
    });

    const depthCache = new Map<string, number>();
    const levelMap = new Map<number, string[]>();
    let maxDepth = 0;

    const getDepth = (id: string): number => {
      if (depthCache.has(id)) return depthCache.get(id)!;
      const visited = new Set<string>();
      const path: string[] = [];
      let current: string | undefined = id;
      while (current) {
        if (visited.has(current)) return 0; // Cycle detected
        if (depthCache.has(current)) {
          let d = depthCache.get(current)!;
          for (let i = path.length - 1; i >= 0; i--) depthCache.set(path[i], ++d);
          return depthCache.get(id)!;
        }
        visited.add(current);
        path.push(current);
        current = parentIdMap.get(current);
      }
      for (let i = path.length - 1; i >= 0; i--) depthCache.set(path[i], path.length - i - 1);
      return depthCache.get(id)!;
    };

    for (const a of accounts) {
      const d = getDepth(a.id);
      if (d > maxDepth) maxDepth = d;
      const itemsInLevel = levelMap.get(d) || [];
      itemsInLevel.push(a.id);
      levelMap.set(d, itemsInLevel);
    }

    this.hierarchyCache = {
      parentIdMap,
      depthCache,
      levelMap,
      maxDepth,
      fingerprint,
    };
  }

  /**
   * Returns an account's balance and transaction count as of a given date.
   * Logic integrated with snapshots and drift tracking.
   */
  async getAccountBalance(
    accountId: AccountId,
    workplaceId: WorkplaceId,
    cutoffDate: number = Number.MAX_SAFE_INTEGER,
  ): Promise<AccountBalance> {
    const account = await accountRepository.find(workplaceId, accountId as AccountId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    const latestTx = await transactionRepository.findLatestForAccount(
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
    workplaceId: WorkplaceId,
    asOfDate?: number,
    targetDefaultCurrency?: string,
    parentTrace?: Trace,
  ): Promise<AccountBalance[]> {
    const start = performance.now();
    const trace = parentTrace || traceService.startTrace('BalanceService.getAccountBalances');
    try {
      const accounts = await accountRepository.findAll(workplaceId);
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
        transactionRawRepository.getLatestBalancesRaw(workplaceId, accountIds, cutoffDate),
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

      await this.aggregateBalances(
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
          `[BalanceService] getAccountBalances took ${duration}ms (${accounts.length} accounts)`,
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

export const balanceService = new BalanceService();
