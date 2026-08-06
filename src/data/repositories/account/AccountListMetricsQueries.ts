import { database } from '@/src/data/database/Database';
import { isAccountSubtype, isAccountType } from '@/src/data/models/Account';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { RawAccountRow, RawSQLArg } from '@/src/data/repositories/TransactionTypes';
import type { AccountListItemRaw } from '@/src/data/repositories/AccountRepository';
import { periodFlowSQL } from '@/src/services/accounting/BalanceEffects';
import { WorkplaceId, AccountType } from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { supportsRawSql } from '@/src/data/database/DatabaseUtils';

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
    if (!supportsRawSql(database)) {
      logger.warn(
        '[AccountListMetricsQueries] getAccountListItemsRaw: Raw SQL not supported. Performance risk.',
      );
      return null;
    }

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
          WHERE t.deleted_at IS NULL AND j.deleted_at IS NULL AND j.status IN (${placeholders})
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
          AND j.deleted_at IS NULL 
          AND j.status IN (${placeholders})
          AND a.workplace_id = ?
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

    const args: RawSQLArg[] = [...statusArgs, workplaceId];
    args.push(startOfMonth, endOfMonth, startOfMonth, endOfMonth, ...statusArgs, workplaceId);
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

    if (!results) return null;

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
}

export const accountListMetricsQueries = new AccountListMetricsQueries();
