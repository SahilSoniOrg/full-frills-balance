import { accountQueryRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { TransactionType, AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { foldBalances } from '@/src/utils/accounting/BalanceEffects';
import { amountsAreEqual, Money, roundToPrecision } from '@/src/utils/money';
import { storage } from '@/src/utils/storage';
import { firstValueFrom } from 'rxjs';
import { selectBalancesForWealthSummary } from '@/src/services/wealth-service';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { isUsableCrossCurrencyRate } from '@/src/services/currencyConversion';
import { AppConfig } from '@/src/constants/app-config';

type StoredAccountListSnapshot = {
  timestamp?: number;
  workplaceId?: string;
  data?: {
    wealthSummary?: { netWorth?: number };
    balances?: { accountId: string; balance: number; directBalance?: number }[];
  };
};

/** Read-only comparison of live account data, its persisted snapshot, and rebuild inputs. */
export async function createBalanceDiagnostics(workplaceId: WorkplaceId, currencyCode: string) {
  const snapshotKey = `accounts_list_data_${workplaceId}`;
  const storedSnapshotRaw = storage.getString(snapshotKey);
  let storedSnapshot: StoredAccountListSnapshot | null = null;
  try {
    storedSnapshot = storedSnapshotRaw
      ? (JSON.parse(storedSnapshotRaw) as StoredAccountListSnapshot)
      : null;
  } catch {
    // Preserve malformed snapshot state in the report without making diagnostics fail.
  }

  const [live, accounts] = await Promise.all([
    firstValueFrom(
      reactiveDataService.observeOptimizedAccountList(currencyCode, workplaceId, false),
    ),
    accountQueryRepository.findAll(workplaceId),
  ]);
  const precisions = await currencyReadService.getAllPrecisions();
  const accountDiagnostics = await Promise.all(
    accounts.map(async account => {
      const [transactions, snapshot] = await Promise.all([
        transactionRawRepository.getRebuildDataRaw(workplaceId, account.id, 0),
        balanceSnapshotRepository.findLatestForAccount(
          workplaceId,
          account.id,
          Number.MAX_SAFE_INTEGER,
        ),
      ]);
      const rebuilt = foldBalances(
        0,
        transactions.map(transaction => ({
          amount: transaction.amount,
          accountType: account.accountType,
          transactionType: transaction.transactionType as TransactionType,
        })),
        precisions.get(account.currencyCode) ?? 2,
      );
      const latestTransaction = transactions.at(-1);
      const databaseBalance = latestTransaction?.runningBalance ?? 0;
      const recomputedBalance = rebuilt.final;
      const transactionBalanceMismatches = transactions.flatMap((transaction, index) => {
        const expected = rebuilt.balances[index];
        const stored = transaction.runningBalance ?? 0;
        return !amountsAreEqual(expected, stored, precisions.get(account.currencyCode) ?? 2)
          ? [
              {
                transactionId: transaction.id,
                date: transaction.transactionDate,
                storedRunningBalance: transaction.runningBalance,
                recomputedRunningBalance: expected,
                difference: expected - stored,
              },
            ]
          : [];
      });
      return {
        accountId: account.id,
        name: account.name,
        accountType: account.accountType,
        currencyCode: account.currencyCode,
        transactionCount: transactions.length,
        latestTransaction: latestTransaction
          ? {
              id: latestTransaction.id,
              date: latestTransaction.transactionDate,
              amount: latestTransaction.amount,
              runningBalance: latestTransaction.runningBalance,
            }
          : null,
        databaseLatestBalance: databaseBalance,
        fullyRecomputedBalance: recomputedBalance,
        balanceDifference: recomputedBalance - databaseBalance,
        transactionBalanceMismatchCount: transactionBalanceMismatches.length,
        transactionBalanceMismatches: transactionBalanceMismatches.slice(0, 20),
        latestSnapshot: snapshot
          ? {
              transactionId: snapshot.transactionId,
              date: snapshot.transactionDate,
              balance: snapshot.absoluteBalance,
              transactionCount: snapshot.transactionCount,
            }
          : null,
      };
    }),
  );

  accountDiagnostics.sort((a, b) => Math.abs(b.balanceDifference) - Math.abs(a.balanceDifference));
  const liveByAccount = new Map(live.balances.map(balance => [balance.accountId, balance]));
  const snapshotBalances = new Map(
    (storedSnapshot?.data?.balances ?? []).map(balance => [balance.accountId, balance]),
  );
  const accountBalanceComparisons = accountDiagnostics.map(account => ({
    accountId: account.accountId,
    name: account.name,
    databaseLatestBalance: account.databaseLatestBalance,
    fullyRecomputedBalance: account.fullyRecomputedBalance,
    liveAccountListBalance: liveByAccount.get(account.accountId)?.directBalance ?? null,
    persistedAccountListBalance:
      snapshotBalances.get(account.accountId)?.directBalance ??
      snapshotBalances.get(account.accountId)?.balance ??
      null,
    balanceDifference: account.balanceDifference,
  }));

  const selectedForWealth = selectBalancesForWealthSummary(
    live.balances,
    new Map(accounts.map(account => [account.id, account.currencyCode])),
    new Set(accounts.map(account => account.parentAccountId).filter(Boolean) as string[]),
  );
  const spotValuations = await Promise.all(
    selectedForWealth.map(async balance => {
      const fromCurrency = balance.currencyCode || currencyCode;
      const sameCurrency = fromCurrency === currencyCode;
      const rate = sameCurrency
        ? 1
        : await exchangeRateService.getRequiredRate(fromCurrency, currencyCode);
      const usable = sameCurrency || isUsableCrossCurrencyRate(fromCurrency, currencyCode, rate);
      const convertedAmount = usable
        ? roundToPrecision(balance.balance * (rate as number), AppConfig.constants.precision)
        : null;

      return {
        accountId: balance.accountId,
        accountType: balance.accountType,
        currencyCode: fromCurrency,
        sourceBalance: balance.balance,
        rateToWorkplaceCurrency: usable ? rate : null,
        convertedBalance: convertedAmount,
      };
    }),
  );
  let totalAssets = Money.from(0, currencyCode);
  let totalLiabilities = Money.from(0, currencyCode);
  for (const valuation of spotValuations) {
    if (valuation.convertedBalance === null) continue;
    const amount = Money.from(valuation.convertedBalance, currencyCode);
    if (valuation.accountType === AccountType.ASSET) totalAssets = totalAssets.add(amount);
    else if (valuation.accountType === AccountType.LIABILITY) {
      totalLiabilities = totalLiabilities.add(amount);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    workplaceId,
    currencyCode,
    netWorth: {
      live: live.wealthSummary.netWorth,
      persistedSnapshot: storedSnapshot?.data?.wealthSummary?.netWorth ?? null,
      snapshotTimestamp: storedSnapshot?.timestamp ?? null,
      snapshotWorkplaceId: storedSnapshot?.workplaceId ?? null,
    },
    spotValuation: {
      recalculatedAt: new Date().toISOString(),
      targetCurrency: currencyCode,
      totalAssets: totalAssets.amount,
      totalLiabilities: totalLiabilities.amount,
      netWorth: totalAssets.subtract(totalLiabilities).amount,
      matchesLiveNetWorth:
        totalAssets.subtract(totalLiabilities).amount === live.wealthSummary.netWorth,
      accounts: spotValuations,
    },
    rebuildQueue: rebuildQueueService.getDiagnostics(workplaceId),
    accounts: accountBalanceComparisons,
    transactionAndSnapshotDetails: accountDiagnostics,
    notes: {
      activeAccounts: accounts.length,
      persistedSnapshotRawPresent: storedSnapshotRaw !== undefined,
      persistedSnapshotParseable: storedSnapshot !== null || storedSnapshotRaw === undefined,
      explanation:
        'Fully recomputed balances fold active database transactions from zero, without using balance snapshots.',
    },
  };
}
