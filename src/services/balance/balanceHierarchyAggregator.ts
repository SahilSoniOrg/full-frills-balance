import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import { convertAmount } from '@/src/services/currencyConversion';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AccountBalance } from '@/src/types/domainReadModels';
import { logger } from '@/src/utils/logger';
import { Money } from '@/src/utils/money';
import { Trace, traceService } from '@/src/utils/TraceService';
import { CachedHierarchy } from './types';

export class BalanceHierarchyAggregator {
  private hierarchyCache: CachedHierarchy | null = null;

  public async aggregateBalances(
    accounts: Account[],
    balancesMap: Map<string, AccountBalance>,
    currencyPrecisionMap: Map<string, number>,
    targetDefaultCurrency?: string,
    parentTrace?: Trace,
  ): Promise<void> {
    const start = performance.now();
    const trace =
      parentTrace || traceService.startTrace('BalanceHierarchyAggregator.aggregateBalances');
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

      await Promise.all(
        Array.from(uniqueBaseCurrencies).map(base =>
          exchangeRateService.fetchRatesForBase(base).catch(() => {}),
        ),
      );

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
            const [balanceConv, incomeConv, expensesConv] = await Promise.all([
              convertAmount({
                amount: myStaged.balance,
                fromCurrency: myBalance.currencyCode,
                toCurrency: effectiveCurrency,
                mode: 'spot',
              }),
              convertAmount({
                amount: myStaged.monthlyIncome,
                fromCurrency: myBalance.currencyCode,
                toCurrency: effectiveCurrency,
                mode: 'spot',
              }),
              convertAmount({
                amount: myStaged.monthlyExpenses,
                fromCurrency: myBalance.currencyCode,
                toCurrency: effectiveCurrency,
                mode: 'spot',
              }),
            ]);

            if (!balanceConv.ok || !incomeConv.ok || !expensesConv.ok) {
              logger.warn(
                `[BalanceHierarchyAggregator] Skipping child aggregation for ${accountId}: FX unavailable (${myBalance.currencyCode} -> ${effectiveCurrency})`,
              );
              continue;
            }

            convertedBalance = Money.from(balanceConv.amount, effectiveCurrency);
            convertedIncome = Money.from(incomeConv.amount, effectiveCurrency);
            convertedExpenses = Money.from(expensesConv.amount, effectiveCurrency);

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
          logger.info(`[BalanceHierarchyAggregator] aggregateBalances took ${duration}ms`);
        }
      }
    }
  }

  private rebuildHierarchyCache(accounts: Account[], fingerprint: string): void {
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
}

export const balanceHierarchyAggregator = new BalanceHierarchyAggregator();
