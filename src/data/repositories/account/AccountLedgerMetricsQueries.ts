import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { effect, periodFlowSQL } from '@/src/utils/accounting/BalanceEffects';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import { from, map, Observable } from 'rxjs';
import { distinctUntilChanged, switchMap } from 'rxjs/operators';
import { transactionObserveQueries } from '../transaction';
import { rawSqlExecutor } from '../raw/RawSqlExecutor';

export interface AccountPeriodMetrics {
  totalIncrease: number;
  totalDecrease: number;
}

interface RawPeriodMetricsRow extends AccountPeriodMetrics {
  accountId: AccountId;
}

interface RawUnreconciledMetricsRow {
  count: number;
  total: number | null;
}

export class AccountLedgerMetricsQueries {
  async getPeriodMetrics(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    startDate: number,
    endDate: number,
    accountType: AccountType,
  ): Promise<AccountPeriodMetrics> {
    const result = await this.getPeriodMetricsByAccount(
      workplaceId,
      [{ accountId, accountType }],
      startDate,
      endDate,
    );
    return result.get(accountId) ?? { totalIncrease: 0, totalDecrease: 0 };
  }

  async getPeriodMetricsByAccount(
    workplaceId: WorkplaceId,
    accountConfigs: readonly { accountId: AccountId; accountType: AccountType }[],
    startDate: number,
    endDate: number,
  ): Promise<Map<AccountId, AccountPeriodMetrics>> {
    if (accountConfigs.length === 0) return new Map();

    const accountIds = accountConfigs.map(config => config.accountId);
    const accountPlaceholders = accountIds.map(() => '?').join(',');
    const statusPlaceholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');
    const { increaseCase, decreaseCase } = periodFlowSQL();
    const sql = `
      SELECT
        t.account_id as accountId,
        SUM(${increaseCase}) as totalIncrease,
        SUM(${decreaseCase}) as totalDecrease
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      JOIN journals j ON t.journal_id = j.id
      WHERE t.workplace_id = ?
        AND a.workplace_id = ?
        AND j.workplace_id = ?
        AND t.account_id IN (${accountPlaceholders})
        AND t.transaction_date >= ?
        AND t.transaction_date <= ?
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.status IN (${statusPlaceholders})
      GROUP BY t.account_id
    `;

    const results = new Map<AccountId, AccountPeriodMetrics>();
    try {
      const rows = await rawSqlExecutor.query<RawPeriodMetricsRow>(sql, [
        workplaceId,
        workplaceId,
        workplaceId,
        ...accountIds,
        startDate,
        endDate,
        ...ACTIVE_JOURNAL_STATUSES,
      ]);

      if (rows !== null) {
        for (const row of rows) {
          results.set(row.accountId, {
            totalIncrease: row.totalIncrease,
            totalDecrease: row.totalDecrease,
          });
        }
      } else {
        const [accounts, transactions] = await Promise.all([
          database.collections
            .get<Account>('accounts')
            .query(Q.where('id', Q.oneOf(accountIds)), Q.where('workplace_id', workplaceId))
            .fetch(),
          database.collections
            .get<Transaction>('transactions')
            .query(
              Q.where('workplace_id', workplaceId),
              Q.on('accounts', 'workplace_id', Q.eq(workplaceId)),
              Q.on('journals', 'workplace_id', Q.eq(workplaceId)),
              Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
              Q.on('journals', 'deleted_at', Q.eq(null)),
              Q.where('account_id', Q.oneOf(accountIds)),
              Q.where('transaction_date', Q.gte(startDate)),
              Q.where('transaction_date', Q.lte(endDate)),
              Q.where('deleted_at', Q.eq(null)),
            )
            .fetch(),
        ]);

        const accountTypeById = new Map(accounts.map(account => [account.id, account.accountType]));
        for (const transaction of transactions) {
          const accountType = accountTypeById.get(transaction.accountId);
          if (!accountType) continue;
          const current = results.get(transaction.accountId) ?? {
            totalIncrease: 0,
            totalDecrease: 0,
          };
          const transactionEffect = effect(accountType, transaction.transactionType);
          if (transactionEffect.isIncrease) current.totalIncrease += transaction.amount;
          else if (transactionEffect.sign < 0) current.totalDecrease += transaction.amount;
          results.set(transaction.accountId, current);
        }
      }
    } catch (error) {
      logger.error('[AccountLedgerMetricsQueries] period metrics query failed', error);
    }

    for (const { accountId } of accountConfigs) {
      if (!results.has(accountId)) {
        results.set(accountId, { totalIncrease: 0, totalDecrease: 0 });
      }
    }
    return results;
  }

  observePeriodMetrics(
    workplaceId: WorkplaceId,
    accountIds: readonly AccountId[],
    startDate: number,
    endDate: number,
    accountType: AccountType,
  ): Observable<AccountPeriodMetrics> {
    return transactionObserveQueries.observeActiveCount(workplaceId).pipe(
      switchMap(() =>
        from(
          this.getPeriodMetricsByAccount(
            workplaceId,
            accountIds.map(accountId => ({ accountId, accountType })),
            startDate,
            endDate,
          ),
        ).pipe(
          map(metricsByAccount =>
            accountIds.reduce<AccountPeriodMetrics>(
              (totals, accountId) => {
                const metrics = metricsByAccount.get(accountId);
                return metrics
                  ? {
                      totalIncrease: totals.totalIncrease + metrics.totalIncrease,
                      totalDecrease: totals.totalDecrease + metrics.totalDecrease,
                    }
                  : totals;
              },
              { totalIncrease: 0, totalDecrease: 0 },
            ),
          ),
        ),
      ),
      distinctUntilChanged(
        (previous, current) =>
          previous.totalIncrease === current.totalIncrease &&
          previous.totalDecrease === current.totalDecrease,
      ),
    );
  }

  observeUnreconciledMetrics(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    reconciledAt: number | null,
    accountType: AccountType,
  ): Observable<{ count: number; total: number }> {
    const statuses = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');
    const { increaseCase, decreaseCase } = periodFlowSQL();
    return transactionObserveQueries.observeActiveCount(workplaceId).pipe(
      switchMap(async () => {
        const sql = `
          SELECT COUNT(*) as count, SUM(${increaseCase}) - SUM(${decreaseCase}) as total
          FROM transactions t
          JOIN accounts a ON t.account_id = a.id
          JOIN journals j ON t.journal_id = j.id
          WHERE t.account_id = ?
            AND a.account_type = ?
            AND (t.transaction_date > ? OR ? IS NULL)
            AND t.deleted_at IS NULL
            AND t.workplace_id = ?
            AND a.workplace_id = ?
            AND j.deleted_at IS NULL
            AND j.workplace_id = ?
            AND j.status IN (${statuses})
        `;
        const rows = await rawSqlExecutor.query<RawUnreconciledMetricsRow>(sql, [
          accountId,
          accountType,
          reconciledAt ?? 0,
          reconciledAt,
          workplaceId,
          workplaceId,
          workplaceId,
          ...ACTIVE_JOURNAL_STATUSES,
        ]);
        if (rows !== null) {
          return { count: rows[0]?.count ?? 0, total: rows[0]?.total ?? 0 };
        }

        const dateClauses =
          reconciledAt !== null ? [Q.where('transaction_date', Q.gt(reconciledAt))] : [];
        const transactions = await database.collections
          .get<Transaction>('transactions')
          .query(
            Q.where('workplace_id', workplaceId),
            Q.on('accounts', 'workplace_id', Q.eq(workplaceId)),
            Q.on('accounts', 'account_type', accountType),
            Q.on('journals', 'workplace_id', Q.eq(workplaceId)),
            Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
            Q.on('journals', 'deleted_at', Q.eq(null)),
            Q.where('account_id', accountId),
            ...dateClauses,
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetch();
        return {
          count: transactions.length,
          total: transactions.reduce(
            (sum, transaction) =>
              sum + effect(accountType, transaction.transactionType).delta(transaction.amount),
            0,
          ),
        };
      }),
    );
  }
}

export const accountLedgerMetricsQueries = new AccountLedgerMetricsQueries();
