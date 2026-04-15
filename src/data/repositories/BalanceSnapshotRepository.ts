import { database } from '@/src/data/database/Database';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import { getRawAdapter } from '../database/DatabaseUtils';

/**
 * Repository for Balance Snapshots.
 * Snapshots are point-in-time balances that accelerate rebuilding and reporting.
 */
export class BalanceSnapshotRepository {
  private get snapshots() {
    return database.collections.get<BalanceSnapshot>('balance_snapshots');
  }

  /**
   * Finds the latest snapshot for an account as of a given date.
   */
  async findLatestForAccount(
    accountId: string,
    date: number = Date.now(),
  ): Promise<BalanceSnapshot | null> {
    const snapshots = await this.snapshots
      .query(
        Q.where('account_id', accountId),
        Q.where('transaction_date', Q.lte(date)),
        Q.sortBy('transaction_date', Q.desc),
        Q.take(1),
      )
      .fetch();
    return snapshots[0] || null;
  }

  /**
   * Creates a new balance snapshot.
   */
  async create(data: {
    accountId: string;
    transactionId: string;
    transactionDate: number;
    absoluteBalance: number;
    transactionCount: number;
  }): Promise<BalanceSnapshot> {
    return database.write(async () => {
      return this.snapshots.create(snapshot => {
        snapshot.accountId = data.accountId;
        snapshot.transactionId = data.transactionId;
        snapshot.transactionDate = data.transactionDate;
        snapshot.absoluteBalance = data.absoluteBalance;
        snapshot.transactionCount = data.transactionCount;
      });
    });
  }

  /**
   * Finds the latest snapshots for multiple accounts as of a given date.
   * Returns a Map of accountId -> SnapshotData.
   */
  async findLatestForAccountsRaw(
    accountIds: string[],
    date: number = Date.now(),
  ): Promise<Map<string, SnapshotData>> {
    const result = new Map<string, SnapshotData>();
    if (accountIds.length === 0) return result;

    const sqlAdapter = getRawAdapter(database);
    if (!sqlAdapter || typeof sqlAdapter.queryRaw !== 'function') {
      logger.warn(
        '[BalanceSnapshotRepository] findLatestForAccountsRaw: Raw SQL not supported. Performance risk.',
      );
      return result;
    }

    const sql = `
      WITH RankedSnapshots AS (
        SELECT 
          bs.id,
          bs.account_id AS accountId,
          bs.transaction_id AS transactionId,
          bs.transaction_date AS transactionDate,
          bs.absolute_balance AS absoluteBalance,
          bs.transaction_count AS transactionCount,
          bs.created_at AS createdAt,
          bs.updated_at AS updatedAt,
          t.created_at AS transactionCreatedAt,
          ROW_NUMBER() OVER (
            PARTITION BY bs.account_id 
            ORDER BY bs.transaction_date DESC, bs.created_at DESC, bs.id DESC
          ) as rn
        FROM balance_snapshots bs
        LEFT JOIN transactions t ON bs.transaction_id = t.id
        WHERE bs.account_id IN (${accountIds.map(() => '?').join(',')})
          AND bs.transaction_date <= ?
      )
      SELECT * FROM RankedSnapshots WHERE rn = 1
    `;

    try {
      const rows = await sqlAdapter.queryRaw(sql, [...accountIds, date]);
      const data = Array.isArray(rows) ? rows : rows?.rows || [];
      for (const row of data) {
        result.set(row.accountId, row as SnapshotData);
      }
    } catch (error) {
      logger.error('[BalanceSnapshotRepository] findLatestForAccountsRaw failed', error);
    }

    return result;
  }

  /**
   * Deletes all snapshots for an account after a certain date.
   * Useful when segments are invalidated.
   */
  async deleteAfterDate(accountId: string, date: number): Promise<void> {
    const snapshotsToDelete = await this.snapshots
      .query(Q.where('account_id', accountId), Q.where('transaction_date', Q.gt(date)))
      .fetch();

    if (snapshotsToDelete.length > 0) {
      await database.write(async () => {
        await database.batch(...snapshotsToDelete.map(s => s.prepareDestroyPermanently()));
      });
    }
  }
}

/**
 * Plain object representing a balance snapshot data.
 */
export interface SnapshotData {
  id: string;
  accountId: string;
  transactionId: string;
  transactionDate: number;
  absoluteBalance: number;
  transactionCount: number;
  createdAt: number;
  updatedAt: number;
  transactionCreatedAt?: number;
}

export const balanceSnapshotRepository = new BalanceSnapshotRepository();
