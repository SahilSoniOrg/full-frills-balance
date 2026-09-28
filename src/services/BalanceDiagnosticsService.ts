import { accountQueryRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { TransactionType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { foldBalances } from '@/src/utils/accounting/BalanceEffects';
import { amountsAreEqual } from '@/src/utils/money';
import { storage } from '@/src/utils/storage';
import { firstValueFrom } from 'rxjs';

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
