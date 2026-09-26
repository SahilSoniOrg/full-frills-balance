import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/types/enums';
import { AccountBalance } from '@/src/types/domainReadModels';
import { WorkplaceId } from '@/src/types/ids';

import { accountQueryRepository } from '@/src/data/repositories/account';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { DailyDelta } from '@/src/data/repositories/TransactionTypes';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import { convertAmount } from '@/src/services/currencyConversion';
import { effect } from '@/src/utils/accounting/BalanceEffects';
import { logger } from '@/src/utils/logger';
import { Money } from '@/src/utils/money';
import { workplaceService } from '@/src/services/WorkplaceService';
import dayjs from 'dayjs';

export interface WealthSummary {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalIncome: number;
  totalExpense: number;
}

export interface DailyNetWorth {
  date: number; // Start of day timestamp
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}

type DailyTotals = { assets: number; liabilities: number };

async function resolveWealthRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
  const result = await convertAmount({
    amount: 1,
    fromCurrency,
    toCurrency,
    mode: 'spot',
  });
  return result.ok ? result.amount : null;
}

/**
 * Balances that may be added into one workplace-currency wealth total.
 * Asset and liability amounts stay in each account's own currency (`directBalance`)
 * so a parent rollup is not relabeled as the workplace currency and then summed raw.
 * Parent direct postings are included once; child postings are not counted again.
 */
export function selectBalancesForWealthSummary(
  balances: readonly AccountBalance[],
  accountCurrencyById: ReadonlyMap<string, string>,
  parentIds: ReadonlySet<string>,
): AccountBalance[] {
  return balances.flatMap(balance => {
    if (
      balance.accountType === AccountType.ASSET ||
      balance.accountType === AccountType.LIABILITY
    ) {
      return [
        {
          ...balance,
          balance: balance.directBalance ?? balance.balance,
          currencyCode: accountCurrencyById.get(balance.accountId) || balance.currencyCode,
        },
      ];
    }
    if (parentIds.has(balance.accountId)) return [];
    return [balance];
  });
}

function addDailyDelta(
  dailyDeltas: Map<string, DailyTotals>,
  dayKey: string,
  accountType: AccountType,
  delta: number,
): void {
  const current = dailyDeltas.get(dayKey) ?? { assets: 0, liabilities: 0 };
  if (accountType === AccountType.ASSET) current.assets += delta;
  else current.liabilities += delta;
  dailyDeltas.set(dayKey, current);
}

/**
 * WealthService - Pure logic for calculating wealth metrics.
 * Follows Rule 1.3: Data-Driven UI (Database is source of truth, service interprets it).
 */
export const wealthService = {
  /**
   * Calculates net worth and category totals from account balances,
   * converting all amounts to the specified target currency.
   */
  async calculateSummary(
    balances: AccountBalance[],
    targetCurrency: string,
  ): Promise<WealthSummary> {
    // H-5 fix: collect results first, then reduce synchronously.
    // Mutating closed-over variables inside Promise.all is semantically wrong
    // even in single-threaded JS — this pattern makes order non-deterministic.
    const converted = await Promise.all(
      balances.map(async b => {
        const balanceCurrency = b.currencyCode || targetCurrency;
        const result = await convertAmount({
          amount: b.balance,
          fromCurrency: balanceCurrency,
          toCurrency: targetCurrency,
          mode: 'spot',
        });
        if (!result.ok) {
          logger.warn(
            `[WealthService] Skipping balance for ${b.accountId}: FX unavailable (${balanceCurrency} -> ${targetCurrency})`,
          );
          return null;
        }
        return { type: b.accountType, money: Money.from(result.amount, targetCurrency) };
      }),
    );

    let assets = Money.from(0, targetCurrency);
    let liabilities = Money.from(0, targetCurrency);
    let equity = Money.from(0, targetCurrency);
    let income = Money.from(0, targetCurrency);
    let expense = Money.from(0, targetCurrency);

    for (const r of converted) {
      if (!r) continue;
      if (r.type === AccountType.ASSET) assets = assets.add(r.money);
      else if (r.type === AccountType.LIABILITY) liabilities = liabilities.add(r.money);
      else if (r.type === AccountType.EQUITY) equity = equity.add(r.money);
      else if (r.type === AccountType.INCOME) income = income.add(r.money);
      else if (r.type === AccountType.EXPENSE) expense = expense.add(r.money);
    }

    return {
      totalAssets: assets.amount,
      totalLiabilities: liabilities.amount,
      totalEquity: equity.amount,
      totalIncome: income.amount,
      totalExpense: expense.amount,
      netWorth: assets.subtract(liabilities).amount,
    };
  },

  /**
   * Calculates Net Worth history for the specified date range.
   *
   * ALGORITHM: "Rewind"
   * 1. Get current balances for all ASSET and LIABILITY accounts.
   * 2. Convert all current balances to the target currency.
   * 3. Fetch ALL relevant transactions for these accounts from START till NOW in ONE query.
   * 4. Iterate backward day-by-day using dayjs, "undoing" transactions.
   * 5. Record snapshots for the requested range.
   */
  async getNetWorthHistory(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    targetCurrency?: string,
    accountIds?: string[],
  ): Promise<DailyNetWorth[]> {
    let currency = targetCurrency;
    if (!currency) {
      currency = await workplaceService.getCurrency(workplaceId);
    }

    const start = dayjs(startDate).startOf('day');
    const end = dayjs(endDate).endOf('day');
    const now = dayjs().endOf('day');

    // 1. Get current direct balances. Parent rollups are not added on top of children.
    const allAccounts = await accountQueryRepository.findAll(workplaceId);
    const accountCurrencyById = new Map(
      allAccounts.map(account => [account.id, account.currencyCode]),
    );

    const allBalances = await balanceReadService.getAccountBalances(workplaceId);
    let relevantBalances = selectBalancesForWealthSummary(
      allBalances,
      accountCurrencyById,
      new Set(),
    ).filter(
      (a: AccountBalance) =>
        a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY,
    );

    if (accountIds && accountIds.length > 0) {
      const accountIdsSet = new Set(accountIds);
      relevantBalances = relevantBalances.filter(a => accountIdsSet.has(a.accountId));
    }

    if (relevantBalances.length === 0) return [];

    // 2. Convert CURRENT state to target currency — collect then reduce (H-5 fix)
    const currentBalances = await Promise.all(
      relevantBalances.map(async acc => {
        const rate = await resolveWealthRate(acc.currencyCode, currency);
        if (rate === null) {
          logger.warn(
            `[WealthService] Skipping history balance for ${acc.accountId}: FX unavailable (${acc.currencyCode} -> ${currency})`,
          );
          return null;
        }
        return { type: acc.accountType, amount: acc.balance * rate };
      }),
    );

    let runningAssets = Money.from(0, currency);
    let runningLiabilities = Money.from(0, currency);

    for (const r of currentBalances) {
      if (!r) continue;
      if (r.type === AccountType.ASSET)
        runningAssets = runningAssets.add(Money.from(r.amount, currency));
      else if (r.type === AccountType.LIABILITY)
        runningLiabilities = runningLiabilities.add(Money.from(r.amount, currency));
    }

    // 3. BULK FETCH daily deltas grouped by currency and type (O(1) round-trip, O(M) rows)
    const activeIds = relevantBalances.map(b => b.accountId);
    const deltas: DailyDelta[] = await transactionRawRepository.getDailyDeltasGroupedRaw(
      workplaceId,
      activeIds,
      start.valueOf(),
      now.valueOf(),
    );

    // 3.5 Pre-fetch exchange rates for all accounts involved to avoid per-transaction overhead
    const uniqueCurrencies = Array.from(new Set(relevantBalances.map(b => b.currencyCode)));
    const rates = new Map<string, number>();
    await Promise.all(
      uniqueCurrencies.map(async c => {
        const rate = await resolveWealthRate(c, currency);
        if (rate !== null) rates.set(c, rate);
      }),
    );

    // 4. Group and convert deltas per day
    const dailyDeltas = new Map<string, { assets: number; liabilities: number }>();
    const dateFormat = AppConfig.strings.formats.date;

    if (deltas.length === 0) {
      const accountTypeById = new Map(relevantBalances.map(a => [a.accountId, a.accountType]));
      const transactions = await transactionQueryRepository.findByAccountsAndDateRange(
        workplaceId,
        activeIds,
        start.valueOf(),
        now.valueOf(),
      );

      const convertedTxs = await Promise.all(
        transactions.map(async tx => {
          const accountType = accountTypeById.get(tx.accountId);
          if (!accountType) return null;

          const rate = rates.get(tx.currencyCode);
          if (rate === undefined) return null;
          const convertedAmount = tx.amount * rate;

          return {
            dayKey: dayjs(tx.transactionDate).format(dateFormat),
            accountType,
            convertedAmount,
            transactionType: tx.transactionType,
          };
        }),
      );

      for (const tx of convertedTxs) {
        if (!tx) continue;
        const impact = effect(tx.accountType, tx.transactionType).delta(tx.convertedAmount);
        addDailyDelta(dailyDeltas, tx.dayKey, tx.accountType, impact);
      }
    } else {
      for (const d of deltas) {
        const dayKey = dayjs(d.dayStart).format(dateFormat);
        const rate = rates.get(d.currencyCode);
        if (rate === undefined) continue;
        const convertedDelta = d.delta * rate;

        addDailyDelta(dailyDeltas, dayKey, d.accountType, convertedDelta);
      }
    }

    const history: DailyNetWorth[] = [];
    let cursor = now;

    // 5. Iterate backward from NOW to START
    while (cursor.isAfter(start) || cursor.isSame(start, 'day')) {
      const isDayInRange =
        (cursor.isBefore(end) || cursor.isSame(end, 'day')) &&
        (cursor.isAfter(start) || cursor.isSame(start, 'day'));

      if (isDayInRange) {
        history.push({
          date: cursor.startOf('day').valueOf(),
          netWorth: runningAssets.subtract(runningLiabilities).amount,
          totalAssets: runningAssets.amount,
          totalLiabilities: runningLiabilities.amount,
        });
      }

      // Undo transactions for this day
      const dayKey = cursor.format(dateFormat);
      const dayDelta = dailyDeltas.get(dayKey);

      if (dayDelta) {
        runningAssets = runningAssets.subtract(Money.from(dayDelta.assets, currency));
        runningLiabilities = runningLiabilities.subtract(
          Money.from(dayDelta.liabilities, currency),
        );
      }

      cursor = cursor.subtract(1, 'day');
    }

    return history.reverse();
  },
};
