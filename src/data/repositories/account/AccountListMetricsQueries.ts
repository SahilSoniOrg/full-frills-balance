import { database } from '@/src/data/database/Database';
import Account, { isAccountSubtype, isAccountType } from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { RawAccountRow, RawSQLArg } from '@/src/data/repositories/TransactionTypes';
import type { AccountListItemRaw } from '@/src/data/repositories/AccountRepository';
import { effect, periodFlowSQL } from '@/src/utils/accounting/BalanceEffects';
import { WorkplaceId, AccountType } from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
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
    includeDeleted: boolean = false,
  ): Promise<AccountListItemRaw[] | null> {
    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');
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
          ${!includeDeleted ? 'AND a.deleted_at IS NULL' : ''}
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
      WHERE ${includeDeleted ? '1=1' : 'a.deleted_at IS NULL'} AND a.workplace_id = ?
      ORDER BY a.order_num ASC
    `;

    const args: RawSQLArg[] = [workplaceId, workplaceId, ...statusArgs, workplaceId];
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

    const start = Date.now();
    const results = await transactionRawRepository.queryRaw<RawAccountRow>(sql, args);
    const duration = Date.now() - start;

    logger.info(`[Trace] AccountListMetricsQueries.getAccountListItemsRaw: ${duration}ms`, {
      count: results?.length || 0,
    });

    if (!results) {
      logger.warn(
        '[AccountListMetricsQueries] getAccountListItemsRaw: Raw SQL not supported. Performance risk.',
      );
      return this.getAccountListItemsFallback(
        startOfMonth,
        endOfMonth,
        workplaceId,
        includeTotalCount,
        includeDeleted,
      );
    }

    return results.map(row => {
      if (!isAccountType(row.account_type)) {
        logger.error(
          `[Integrity] Invalid account_type found in DB: ${row.account_type} for account ${row.id}`,
        );
        row.account_type = AccountType.ASSET;
      }
      if (row.account_subtype && !isAccountSubtype(row.account_subtype)) {
        logger.error(
          `[Integrity] Invalid account_subtype found in DB: ${row.account_subtype} for account ${row.id}`,
        );
        row.account_subtype = undefined;
      }
      return row as AccountListItemRaw;
    });
  }

  private async getAccountListItemsFallback(
    startOfMonth: number,
    endOfMonth: number,
    workplaceId: WorkplaceId,
    includeTotalCount: boolean,
    includeDeleted: boolean,
  ): Promise<AccountListItemRaw[]> {
    const accountClauses: Q.Clause[] = [
      Q.where('workplace_id', workplaceId),
      Q.sortBy('order_num', Q.asc),
    ];
    if (!includeDeleted) {
      accountClauses.push(Q.where('deleted_at', Q.eq(null)));
    }

    const accounts = await database.collections
      .get<Account>('accounts')
      .query(...accountClauses)
      .fetch();
    if (accounts.length === 0) return [];

    const accountIds = accounts.map(account => account.id);
    const transactionClauses: Q.Clause[] = [
      Q.where('workplace_id', workplaceId),
      Q.on('accounts', 'workplace_id', Q.eq(workplaceId)),
      Q.on('journals', 'workplace_id', Q.eq(workplaceId)),
      Q.on('journals', 'deleted_at', Q.eq(null)),
      Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
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
