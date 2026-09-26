import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import { AccountType } from '@/src/types/enums';
import { convertAmount } from '@/src/services/currencyConversion';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AccountBalance } from '@/src/types/domainReadModels';
import { logger } from '@/src/utils/logger';
import { Money } from '@/src/utils/money';
import { Trace, startTrace } from '@/src/utils/TraceService';
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
    const trace = parentTrace || startTrace('BalanceHierarchyAggregator.aggregateBalances');
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

      // 2. Pre-fetch all required exchange rates for the entire hierarchy in parallel
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

      // 3. Staged aggregation setup (Transactional read consistency)
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

      // 4. Aggregate leaf-to-root. A parent total stays in that account's currency;
      // children in another currency are converted into it.
      for (let d = maxDepth; d > 0; d--) {
        const accountIdsAtLevel = levelMap.get(d) || [];

        for (const accountId of accountIdsAtLevel) {
          const parentId = parentIdMap.get(accountId);
          if (!parentId) continue;

          const parentStaged = stagedResults.get(parentId);
          const myStaged = stagedResults.get(accountId);
          if (!parentStaged || !myStaged) continue;

          const parentCurrency = parentStaged.currencyCode;
          const childCurrency = myStaged.currencyCode;
          const precision =
            currencyPrecisionMap.get(parentCurrency) ?? AppConfig.defaultCurrencyPrecision;

          let convertedBalance = Money.from(myStaged.balance, childCurrency);
          let convertedIncome = Money.from(myStaged.monthlyIncome, childCurrency);
          let convertedExpenses = Money.from(myStaged.monthlyExpenses, childCurrency);

          if (childCurrency !== parentCurrency) {
            const [balanceConv, incomeConv, expensesConv] = await Promise.all([
              convertAmount({
                amount: myStaged.balance,
                fromCurrency: childCurrency,
                toCurrency: parentCurrency,
                mode: 'spot',
              }),
              convertAmount({
                amount: myStaged.monthlyIncome,
                fromCurrency: childCurrency,
                toCurrency: parentCurrency,
                mode: 'spot',
              }),
              convertAmount({
                amount: myStaged.monthlyExpenses,
                fromCurrency: childCurrency,
                toCurrency: parentCurrency,
                mode: 'spot',
              }),
            ]);

            if (!balanceConv.ok || !incomeConv.ok || !expensesConv.ok) {
              logger.warn(
                `[BalanceHierarchyAggregator] Skipping child aggregation for ${accountId}: FX unavailable (${childCurrency} -> ${parentCurrency})`,
              );
              continue;
            }

            convertedBalance = Money.from(balanceConv.amount, parentCurrency);
            convertedIncome = Money.from(incomeConv.amount, parentCurrency);
            convertedExpenses = Money.from(expensesConv.amount, parentCurrency);

            // Track mixed child balances (O(1) Map lookup instead of O(N) find)
            const existing = parentStaged.childBalancesMap.get(childCurrency);
            if (existing) {
              const childPrecision =
                currencyPrecisionMap.get(childCurrency) ?? AppConfig.defaultCurrencyPrecision;
              existing.balance = Money.from(existing.balance, childCurrency)
                .add(Money.from(myStaged.balance, childCurrency))
                .round(childPrecision).amount;
            } else {
              parentStaged.childBalancesMap.set(childCurrency, {
                currencyCode: childCurrency,
                balance: myStaged.balance,
                transactionCount: myStaged.transactionCount,
              });
            }
          }

          const parentBalanceMoney = Money.from(parentStaged.balance, parentCurrency);
          const parentIncomeMoney = Money.from(parentStaged.monthlyIncome, parentCurrency);
          const parentExpensesMoney = Money.from(parentStaged.monthlyExpenses, parentCurrency);

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

      // 5. Commit staged results to the main balances map in a synchronous pass
      // This pattern ensures that any parallel readers never see half-aggregated states.
      // Category accounts are always displayed in the Workplace currency. Their
      // direct balance may be stored in a foreign account currency, so normalize
      // the staged values before publishing them to account-detail readers.
      const categoryAccounts = accounts.filter(
        account =>
          account.accountType === AccountType.INCOME || account.accountType === AccountType.EXPENSE,
      );
      await Promise.all(
        categoryAccounts.map(async account => {
          const staging = stagedResults.get(account.id);
          if (!staging || staging.currencyCode === targetDefaultCurrency) return;

          const [balance, monthlyIncome, monthlyExpenses] = await Promise.all([
            convertAmount({
              amount: staging.balance,
              fromCurrency: staging.currencyCode,
              toCurrency: targetDefaultCurrency!,
              mode: 'spot',
            }),
            convertAmount({
              amount: staging.monthlyIncome,
              fromCurrency: staging.currencyCode,
              toCurrency: targetDefaultCurrency!,
              mode: 'spot',
            }),
            convertAmount({
              amount: staging.monthlyExpenses,
              fromCurrency: staging.currencyCode,
              toCurrency: targetDefaultCurrency!,
              mode: 'spot',
            }),
          ]);

          if (!balance.ok || !monthlyIncome.ok || !monthlyExpenses.ok) {
            logger.warn(
              `[BalanceHierarchyAggregator] Skipping category normalization for ${account.id}: FX unavailable (${staging.currencyCode} -> ${targetDefaultCurrency})`,
            );
            return;
          }

          staging.balance = balance.amount;
          staging.monthlyIncome = monthlyIncome.amount;
          staging.monthlyExpenses = monthlyExpenses.amount;
          staging.currencyCode = targetDefaultCurrency!;
        }),
      );

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
