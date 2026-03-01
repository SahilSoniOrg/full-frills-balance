import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { AccountBalance } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { roundToPrecision } from '@/src/utils/money';
import { preferences } from '../utils/preferences';

import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';

export class BalanceService {
    /**
     * Aggregates balances from child accounts to their parents.
     * Supports multi-level hierarchy.
     */
    public async aggregateBalances(
        accounts: Account[],
        balancesMap: Map<string, AccountBalance>,
        accountPrecisionMap: Map<string, number>,
        targetDefaultCurrency: string = preferences.defaultCurrencyCode || AppConfig.defaultCurrency
    ) {
        // 1. Build child-to-parent map
        const parentIdMap = new Map<string, string>();
        accounts.forEach(a => {
            if (a.parentAccountId) {
                parentIdMap.set(a.id, a.parentAccountId);
            }
        });

        // 2. Build cached depth calculator (iterative with cycle detection)
        const depthCache = new Map<string, number>();
        const getDepth = (id: string): number => {
            if (depthCache.has(id)) return depthCache.get(id)!;

            const path: string[] = [];
            let current = id;

            // Traverse up to root, detecting cycles
            while (current) {
                if (path.includes(current)) {
                    logger.error(`Cycle detected in account hierarchy: ${path.join(' -> ')} -> ${current}`);
                    return 0; // Safe fallback
                }
                if (depthCache.has(current)) {
                    // Backfill cache for entire path
                    let depth = depthCache.get(current)!;
                    for (let i = path.length - 1; i >= 0; i--) {
                        depthCache.set(path[i], ++depth);
                    }
                    return depthCache.get(id)!;
                }
                path.push(current);
                current = parentIdMap.get(current) || '';
            }

            // Reached root, backfill
            for (let i = path.length - 1; i >= 0; i--) {
                depthCache.set(path[i], path.length - i - 1);
            }
            return depthCache.get(id)!;
        };

        // 3. Track sub-tree currencies for each parent to determine target currency
        const subTreeCurrencies = new Map<string, Set<string>>();
        accounts.forEach(a => {
            const currencies = new Set<string>();
            const balance = balancesMap.get(a.id);
            if (balance && (balance.balance !== 0 || balance.transactionCount > 0)) {
                currencies.add(balance.currencyCode);
            }
            subTreeCurrencies.set(a.id, currencies);
        });

        // 4. Propagate currency lists up the chain (deepest first)
        const sortedByDepthDesc = [...accounts].sort((a, b) => getDepth(b.id) - getDepth(a.id));

        for (const account of sortedByDepthDesc) {
            const parentId = parentIdMap.get(account.id);
            if (!parentId) continue;
            const myCurrencies = subTreeCurrencies.get(account.id);
            const parentCurrencies = subTreeCurrencies.get(parentId);
            if (myCurrencies && parentCurrencies) {
                myCurrencies.forEach(c => parentCurrencies.add(c));
            }
        }

        // 5. Group accounts by depth levels for parallel processing
        const levelMap = new Map<number, string[]>();
        let maxDepth = 0;

        accounts.forEach(a => {
            const d = getDepth(a.id);
            if (d > maxDepth) maxDepth = d;
            if (!levelMap.has(d)) levelMap.set(d, []);
            levelMap.get(d)!.push(a.id);
        });

        // 6. Aggregate leaf-to-root, level by level
        for (let d = maxDepth; d > 0; d--) {
            const accountIdsAtLevel = levelMap.get(d) || [];

            // Aggregation for this level is now synchronous and non-blocking

            for (const accountId of accountIdsAtLevel) {
                const parentId = parentIdMap.get(accountId);
                if (!parentId) continue;

                const myBalance = balancesMap.get(accountId);
                const parentBalance = balancesMap.get(parentId);
                if (!myBalance || !parentBalance || (myBalance.balance === 0 && myBalance.transactionCount === 0)) continue;

                const pCurrencies = subTreeCurrencies.get(parentId);
                let targetCurrency = parentBalance.currencyCode;

                if (pCurrencies && pCurrencies.size === 1) {
                    targetCurrency = Array.from(pCurrencies)[0] || parentBalance.currencyCode;
                } else if (pCurrencies && pCurrencies.size > 1) {
                    targetCurrency = targetDefaultCurrency;
                }

                parentBalance.currencyCode = targetCurrency;

                // Conversion Logic
                const processConversion = () => {
                    const precision = accountPrecisionMap.get(parentId) ?? AppConfig.defaultCurrencyPrecision;
                    let amountToAdd = myBalance.balance;
                    let incomeToAdd = myBalance.monthlyIncome;
                    let expensesToAdd = myBalance.monthlyExpenses;

                    if (myBalance.currencyCode !== targetCurrency) {
                        const rate = exchangeRateService.getRateSafe(myBalance.currencyCode, targetCurrency);

                        amountToAdd = myBalance.balance * rate;
                        incomeToAdd = myBalance.monthlyIncome * rate;
                        expensesToAdd = myBalance.monthlyExpenses * rate;

                        // Track mixed child balances for UI "Multi-currency" indicator
                        if (!parentBalance.childBalances) parentBalance.childBalances = [];
                        const existing = parentBalance.childBalances.find(cb => cb.currencyCode === myBalance.currencyCode);
                        if (existing) {
                            existing.balance = roundToPrecision(existing.balance + myBalance.balance, precision);
                        } else {
                            parentBalance.childBalances.push({
                                currencyCode: myBalance.currencyCode,
                                balance: myBalance.balance,
                                transactionCount: myBalance.transactionCount
                            });
                        }
                    }

                    parentBalance.balance = roundToPrecision(parentBalance.balance + amountToAdd, precision);
                    parentBalance.monthlyIncome = roundToPrecision(parentBalance.monthlyIncome + incomeToAdd, precision);
                    parentBalance.monthlyExpenses = roundToPrecision(parentBalance.monthlyExpenses + expensesToAdd, precision);
                    parentBalance.transactionCount += myBalance.transactionCount;
                };

                processConversion();
            }
        }
    }

    /**
     * Returns an account's balance and transaction count as of a given date.
     * Logic integrated with snapshots and drift tracking.
     */
    async getAccountBalance(
        accountId: string,
        cutoffDate: number = Date.now()
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
                monthlyExpenses: 0
            };
        }

        const snapshot = await balanceSnapshotRepository.findLatestForAccount(accountId, cutoffDate);
        let baseCount = 0;
        let startDate = 0;

        if (snapshot) {
            baseCount = snapshot.transactionCount;
            startDate = snapshot.transactionDate;
        }

        const deltaCount = await transactionRepository.getCountForAccountBetween(
            accountId,
            startDate,
            cutoffDate
        );

        const totalCount = baseCount + deltaCount;

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
            monthlyExpenses: 0
        };
    }

    /**
     * Gets balances for all active accounts in batch.
     */
    async getAccountBalances(asOfDate?: number, targetDefaultCurrency: string = preferences.defaultCurrencyCode || AppConfig.defaultCurrency): Promise<AccountBalance[]> {
        const accounts = await accountRepository.findAll();
        if (accounts.length === 0) return [];

        const cutoffDate = asOfDate ?? Date.now();
        const accountIds = accounts.map(a => a.id);

        // 1. Batch fetch latest balances from transactions
        const latestBalancesMap = await transactionRawRepository.getLatestBalancesRaw(accountIds, cutoffDate);

        // 2. Batch fetch latest snapshots
        const latestSnapshotsMap = await balanceSnapshotRepository.findLatestForAccountsRaw(accountIds, cutoffDate);

        // 3. Prepare for batch count fetching
        const countInput = accounts.map(a => ({
            accountId: a.id,
            startDate: latestSnapshotsMap.get(a.id)?.transactionDate || 0
        }));

        // 4. Batch fetch transaction counts (O(1) round-trip vs O(N))
        const deltaCountsMap = await transactionRawRepository.getAccountTransactionCountsRaw(countInput, cutoffDate);

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
                monthlyExpenses: 0
            } as AccountBalance;
        });

        const balancesMap = new Map(balances.map(b => [b.accountId, b]));

        // Fetch currency precision for accurate rounding
        const currencyPrecisionMap = await currencyRepository.getAllPrecisions();
        const precisionMap = new Map<string, number>();
        for (const account of accounts) {
            const precision = currencyPrecisionMap.get(account.currencyCode) ?? AppConfig.defaultCurrencyPrecision;
            precisionMap.set(account.id, precision);
        }

        await this.aggregateBalances(accounts, balancesMap, precisionMap, targetDefaultCurrency);

        return Array.from(balancesMap.values());
    }
}

export const balanceService = new BalanceService();
