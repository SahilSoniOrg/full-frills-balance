import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import { isAccountSubtype, isAccountType } from '@/src/types/accountSubtype';
import Transaction from '@/src/data/models/Transaction';
import type { RawSqlArg } from '@/src/data/database/DatabaseUtils';
import { RawAccountRow } from '@/src/data/repositories/TransactionTypes';
import { rawSqlExecutor } from '@/src/data/repositories/raw/RawSqlExecutor';
import type { AccountListItemRaw } from './types';
import { AccountBalance } from '@/src/types/domainReadModels';
import { WorkplaceId } from '@/src/types/ids';
import { effect, periodFlowSQL } from '@/src/utils/accounting/BalanceEffects';
import { AccountType } from '@/src/types/enums';
import {
  ACTIVE_JOURNAL_STATUSES,
  activeJournalStatusSqlPlaceholders,
} from '@/src/utils/journalStatus';
import { activeJournalLegClauses } from '../transaction/transactionActiveClauses';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';

/**
 * Raw SQL account list metrics (balances + period stats) for dashboard/account screens.
 */
export class AccountListMetricsQueries {
  async getAccountListItemsRaw(
    startOfMonth: number,
    endOfMonth: number,
    workplaceId: WorkplaceId,
    includeTotalCount: boolean = false,
  ): Promise<AccountListItemRaw[] | null> {
    const placeholders = activeJournalStatusSqlPlaceholders();
    const statusArgs = [...ACTIVE_JOURNAL_STATUSES];
    const { increaseCase, decreaseCase } = periodFlowSQL();

    const sql = `
      WITH LatestBalance AS (
        SELECT account_id, running_balance
        FROM (
          SELECT 
            t.account_id, 
            t.running_balance,
            ROW_NUMBER() OVER (
              PARTITION BY t.account_id 
              ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC
            ) as rn
          FROM transactions t
          JOIN journals j ON t.journal_id = j.id
          WHERE t.deleted_at IS NULL
            AND t.workplace_id = ?
            AND j.deleted_at IS NULL
            AND j.workplace_id = ?
            AND j.status IN (${placeholders})
            AND t.account_id IN (SELECT id FROM accounts WHERE deleted_at IS NULL AND workplace_id = ?)
        )
        WHERE rn = 1
      ),
      Aggregates AS (
        SELECT 
          t.account_id,
          SUM(CASE WHEN t.transaction_date >= ? AND t.transaction_date <= ? THEN ${increaseCase} ELSE 0 END) as periodIncrease,
          SUM(CASE WHEN t.transaction_date >= ? AND t.transaction_date <= ? THEN ${decreaseCase} ELSE 0 END) as periodDecrease
          ${includeTotalCount ? ', COUNT(*) as direct_transaction_count' : ''}
        FROM transactions t
        JOIN journals j ON t.journal_id = j.id
        JOIN accounts a ON t.account_id = a.id
        WHERE t.deleted_at IS NULL 
          AND t.workplace_id = ?
          AND j.deleted_at IS NULL 
          AND j.workplace_id = ?
          AND j.status IN (${placeholders})
          AND a.workplace_id = ?
          AND a.deleted_at IS NULL
          ${!includeTotalCount ? 'AND t.transaction_date >= ? AND t.transaction_date <= ?' : ''}
        GROUP BY t.account_id
      )
      SELECT 
        a.id as id, 
        a.name as name, 
        a.account_type as account_type, 
        a.account_subtype as account_subtype, 
        a.currency_code as currency_code, 
        a.icon as icon, 
        a.color as color,
        a.parent_account_id as parent_account_id,
        lb.running_balance as direct_balance,
        ${includeTotalCount ? 'IFNULL(agg.direct_transaction_count, 0)' : '0'} as direct_transaction_count,
        IFNULL(agg.periodIncrease, 0) as periodIncrease,
        IFNULL(agg.periodDecrease, 0) as periodDecrease
      FROM accounts a
      LEFT JOIN LatestBalance lb ON a.id = lb.account_id
      LEFT JOIN Aggregates agg ON a.id = agg.account_id
      WHERE a.deleted_at IS NULL AND a.workplace_id = ?
      ORDER BY a.order_num ASC
    `;

    const args: RawSqlArg[] = [workplaceId, workplaceId, ...statusArgs, workplaceId];
    args.push(
      startOfMonth,
      endOfMonth,
      startOfMonth,
      endOfMonth,
      workplaceId,
      workplaceId,
      ...statusArgs,
      workplaceId,
    );
    if (!includeTotalCount) {
      args.push(startOfMonth, endOfMonth);
    }
    args.push(workplaceId);

    const results = await rawSqlExecutor.query<RawAccountRow>(sql, args);

    if (!results) {
      logger.warn(
        '[AccountListMetricsQueries] getAccountListItemsRaw: Raw SQL not supported. Performance risk.',
      );
      return this.getAccountListItemsFallback(
        startOfMonth,
        endOfMonth,
        workplaceId,
        includeTotalCount,
      );
    }

    return results.map(row => {
      let account_type = row.account_type;
      let account_subtype = row.account_subtype;
      if (!isAccountType(account_type)) {
        logger.error(
          `[Integrity] Invalid account_type found in DB: ${account_type} for account ${row.id}`,
        );
        account_type = AccountType.ASSET;
      }
      if (account_subtype && !isAccountSubtype(account_subtype)) {
        logger.error(
          `[Integrity] Invalid account_subtype found in DB: ${account_subtype} for account ${row.id}`,
        );
        account_subtype = undefined;
      }
      return { ...row, account_type, account_subtype } as AccountListItemRaw;
    });
  }

  private async getAccountListItemsFallback(
    startOfMonth: number,
    endOfMonth: number,
    workplaceId: WorkplaceId,
    includeTotalCount: boolean,
  ): Promise<AccountListItemRaw[]> {
    const accountClauses: Q.Clause[] = [
      Q.where('workplace_id', workplaceId),
      Q.where('deleted_at', Q.eq(null)),
      Q.sortBy('order_num', Q.asc),
    ];

    const accounts = await database.collections
      .get<Account>('accounts')
      .query(...accountClauses)
      .fetch();
    if (accounts.length === 0) return [];

    const accountIds = accounts.map(account => account.id);
    const transactionClauses: Q.Clause[] = [
      ...activeJournalLegClauses(workplaceId),
      Q.on('accounts', 'workplace_id', Q.eq(workplaceId)),
      Q.where('account_id', Q.oneOf(accountIds)),
      Q.where('deleted_at', Q.eq(null)),
    ];

    const transactions = await database.collections
      .get<Transaction>('transactions')
      .query(...transactionClauses)
      .fetch();
    const transactionsByAccount = new Map<string, Transaction[]>();
    for (const transaction of transactions) {
      const accountTransactions = transactionsByAccount.get(transaction.accountId) ?? [];
      accountTransactions.push(transaction);
      transactionsByAccount.set(transaction.accountId, accountTransactions);
    }

    return accounts.map(account => {
      const accountTransactions = transactionsByAccount.get(account.id) ?? [];
      const latestTransaction = account.deletedAt
        ? undefined
        : accountTransactions.reduce<Transaction | undefined>((latest, transaction) => {
            if (!latest) return transaction;
            const transactionCreatedAt = transaction.createdAt?.getTime() ?? 0;
            const latestCreatedAt = latest.createdAt?.getTime() ?? 0;
            if (transaction.transactionDate !== latest.transactionDate) {
              return transaction.transactionDate > latest.transactionDate ? transaction : latest;
            }
            if (transactionCreatedAt !== latestCreatedAt) {
              return transactionCreatedAt > latestCreatedAt ? transaction : latest;
            }
            return transaction.id > latest.id ? transaction : latest;
          }, undefined);

      let periodIncrease = 0;
      let periodDecrease = 0;
      for (const transaction of accountTransactions) {
        if (
          transaction.transactionDate < startOfMonth ||
          transaction.transactionDate > endOfMonth
        ) {
          continue;
        }
        const balanceEffect = effect(account.accountType, transaction.transactionType);
        if (balanceEffect.sign > 0) periodIncrease += transaction.amount;
        if (balanceEffect.sign < 0) periodDecrease += transaction.amount;
      }

      return {
        id: account.id,
        name: account.name,
        account_type: account.accountType,
        account_subtype: account.accountSubtype,
        currency_code: account.currencyCode,
        icon: account.icon,
        color: account.color,
        parent_account_id: account.parentAccountId,
        direct_balance: latestTransaction?.runningBalance ?? 0,
        direct_transaction_count: includeTotalCount ? accountTransactions.length : 0,
        periodIncrease,
        periodDecrease,
      } as AccountListItemRaw;
    });
  }
}

export const accountListMetricsQueries = new AccountListMetricsQueries();

export function mapAccountListRowToBalance(
  item: AccountListItemRaw,
  asOfDate: number,
): AccountBalance {
  const accountId = item.id;
  const balance = Number(item.direct_balance ?? 0);
  const currencyCode = item.currency_code;
  const accountType = item.account_type as AccountType;
  const income = Number(item.periodIncrease ?? 0);
  const expenses = Number(item.periodDecrease ?? 0);
  const txCount = Number(item.direct_transaction_count ?? 0);

  return {
    accountId,
    balance,
    directBalance: balance,
    currencyCode: String(currencyCode),
    transactionCount: txCount,
    directTransactionCount: txCount,
    asOfDate,
    accountType,
    monthlyIncome: Math.max(0, income),
    monthlyExpenses: Math.max(0, expenses),
  };
}
