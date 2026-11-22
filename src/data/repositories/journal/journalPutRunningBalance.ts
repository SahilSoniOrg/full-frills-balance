import Transaction from '@/src/data/models/Transaction';
import type { ValidatedJournal } from '@/src/data/repositories/journal/journalPersistenceTypes';
import { transactionRawRebuildQueries } from '@/src/data/repositories/raw/TransactionRawRebuildQueries';
import { effect } from '@/src/domain/accounting/BalanceEffects';
import { AccountId, WorkplaceId } from '@/src/types/ids';

/**
 * Each account's balance after this journal, in rebuild order: every active line dated on or
 * before the journal (new lines sort last by creation time), minus the lines this put replaces.
 */
export async function runningBalancesAfter(
  workplaceId: WorkplaceId,
  journalDate: number,
  balance: ValidatedJournal,
  replacedTransactions: readonly Transaction[],
): Promise<Map<AccountId, number>> {
  const accountIds = [...new Set(balance.lines.map(line => line.accountId))];
  const entries = await Promise.all(
    accountIds.map(async accountId => {
      const { accountType } = balance.accountsById.get(accountId)!;
      const precision = balance.precisionByAccountId.get(accountId)!;
      let runningBalance = await transactionRawRebuildQueries.getAccountSumRaw(
        workplaceId,
        accountId,
        journalDate,
        accountType,
      );
      for (const replaced of replacedTransactions) {
        if (replaced.accountId === accountId && replaced.transactionDate <= journalDate) {
          runningBalance -= effect(accountType, replaced.transactionType).delta(replaced.amount);
        }
      }
      for (const line of balance.lines) {
        if (line.accountId === accountId) {
          runningBalance = effect(accountType, line.transactionType).apply(
            runningBalance,
            line.amount,
            precision,
          );
        }
      }
      return [accountId, runningBalance] as const;
    }),
  );
  return new Map(entries);
}
