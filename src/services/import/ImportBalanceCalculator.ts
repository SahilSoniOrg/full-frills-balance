import { database } from '@/src/data/database/Database';
import { AccountType, isAccountType } from '@/src/data/models/Account';
import Currency from '@/src/data/models/Currency';
import { TransactionType } from '@/src/data/models/Transaction';
import type {
  BatchImportData,
  ImportedTransaction,
} from '@/src/data/repositories/ImportRepository';
import { accountingDomainService } from '@/src/services/accounting/AccountingDomainService';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { roundToPrecision } from '@/src/utils/money';

/**
 * Calculates running balances for imported transactions before bulk persistence.
 */
export async function calculateImportRunningBalances(
  data: BatchImportData,
  onProgress?: (message: string, progress?: number) => void,
): Promise<void> {
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

  let accountsProcessed = 0;
  const totalAccounts = transactionsByAccount.size;

  for (const [accountId, accountTransactions] of transactionsByAccount.entries()) {
    const account = accountMap.get(accountId);
    if (!account) continue;

    const accountType = isAccountType(account.accountType)
      ? account.accountType
      : AccountType.ASSET;
    const precision = precisionMap.get(account.currencyCode) ?? 2;

    accountTransactions.sort((a, b) => {
      if (a.transactionDate !== b.transactionDate) return a.transactionDate - b.transactionDate;
      if (a.createdAt !== b.createdAt) return (a.createdAt || 0) - (b.createdAt || 0);
      return a.id.localeCompare(b.id);
    });

    let currentBalance = 0;
    for (const t of accountTransactions) {
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

        currentBalance = accountingDomainService.calculateNewBalance(
          currentBalance,
          roundedAmount,
          accountType,
          transactionType,
          precision,
        );
        t.runningBalance = currentBalance;
        t.amount = roundedAmount;
      } else {
        t.runningBalance = 0;
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
}
