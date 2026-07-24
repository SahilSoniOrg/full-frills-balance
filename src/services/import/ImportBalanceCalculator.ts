import { database } from '@/src/data/database/Database';
import { AccountType, isAccountType } from '@/src/data/models/Account';
import Currency from '@/src/data/models/Currency';
import { TransactionType } from '@/src/data/models/Transaction';
import type {
  BatchImportData,
  ImportedTransaction,
} from '@/src/data/repositories/ImportRepository';
import { effect } from '@/src/services/accounting/BalanceEffects';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { roundToPrecision } from '@/src/utils/money';

export type ImportBalancePatch = {
  transactionId: string;
  runningBalance: number;
  amount: number;
};

/**
 * Pure calculation of running balances for imported transactions.
 * Returns patches; caller assigns onto the batch (does not mutate `data`).
 */
export async function calculateImportRunningBalances(
  data: BatchImportData,
  onProgress?: (message: string, progress?: number) => void,
): Promise<ImportBalancePatch[]> {
  onProgress?.('Calculating transaction balances...', 0.02);
  logger.info('[ImportBalanceCalculator] Calculating transaction balances...');

  const journalStatusMap = new Map<string, string>();
  data.journals.forEach(j => journalStatusMap.set(j.id, j.status));

  const transactionsByAccount = new Map<string, ImportedTransaction[]>();
  data.transactions.forEach(t => {
    const list = transactionsByAccount.get(t.accountId) || [];
    list.push(t);
    transactionsByAccount.set(t.accountId, list);
  });

  const accountMap = new Map(data.accounts.map(a => [a.id, a]));
  const currencies = await database.collections.get<Currency>('currencies').query().fetch();
  const precisionMap = new Map(currencies.map(c => [c.code, c.precision]));

  const patches: ImportBalancePatch[] = [];
  let accountsProcessed = 0;
  const totalAccounts = transactionsByAccount.size;

  for (const [accountId, accountTransactions] of transactionsByAccount.entries()) {
    const account = accountMap.get(accountId);
    if (!account) continue;

    const accountType = isAccountType(account.accountType)
      ? account.accountType
      : AccountType.ASSET;
    const precision = precisionMap.get(account.currencyCode) ?? 2;

    const ordered = [...accountTransactions].sort((a, b) => {
      if (a.transactionDate !== b.transactionDate) return a.transactionDate - b.transactionDate;
      if (a.createdAt !== b.createdAt) return (a.createdAt || 0) - (b.createdAt || 0);
      return a.id.localeCompare(b.id);
    });

    let currentBalance = 0;
    for (const t of ordered) {
      const journalStatus = journalStatusMap.get(t.journalId);
      const isDeleted = !!t.deletedAt;
      const isActive = !isDeleted && ACTIVE_JOURNAL_STATUSES.includes(journalStatus as any);

      if (isActive) {
        const roundedAmount = roundToPrecision(t.amount, precision);
        const transactionType = Object.values(TransactionType).includes(
          t.transactionType as TransactionType,
        )
          ? (t.transactionType as TransactionType)
          : TransactionType.DEBIT;

        currentBalance = effect(accountType, transactionType).apply(
          currentBalance,
          roundedAmount,
          precision,
        );
        patches.push({
          transactionId: t.id,
          runningBalance: currentBalance,
          amount: roundedAmount,
        });
      } else {
        patches.push({
          transactionId: t.id,
          runningBalance: 0,
          amount: t.amount,
        });
      }
    }

    accountsProcessed++;
    if (totalAccounts > 0) {
      onProgress?.(
        `Calculating transaction balances (${accountsProcessed}/${totalAccounts})...`,
        0.02 + (accountsProcessed / totalAccounts) * 0.08,
      );
    }
  }

  return patches;
}

/** Apply calculator patches onto a mutable import batch. */
export function applyImportBalancePatches(
  data: BatchImportData,
  patches: ImportBalancePatch[],
): void {
  const byId = new Map(data.transactions.map(t => [t.id, t]));
  for (const patch of patches) {
    const tx = byId.get(patch.transactionId);
    if (!tx) continue;
    tx.runningBalance = patch.runningBalance;
    tx.amount = patch.amount;
  }
}
