import { database } from '@/src/data/database/Database';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import { AccountId, TransactionId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import Transaction from '@/src/data/models/Transaction';
import { getRawAdapter, rowsFromQueryRaw } from '../database/DatabaseUtils';

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
    workplaceId: WorkplaceId,
    accountId: AccountId,
    date: number = Date.now(),
  ): Promise<BalanceSnapshot | null> {
    const snapshots = await this.snapshots
      .query(
        Q.where('workplace_id', workplaceId),
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
  async create(
    workplaceId: WorkplaceId,
    data: {
      accountId: AccountId;
      transactionId: TransactionId;
      transactionDate: number;
      absoluteBalance: number;
      transactionCount: number;
    },
  ): Promise<BalanceSnapshot> {
    return database.write(async () => {
      return this.snapshots.create(snapshot => {
        snapshot.workplaceId = workplaceId;
        snapshot.accountId = data.accountId;
        snapshot.transactionId = data.transactionId;
        snapshot.transactionDate = data.transactionDate;
        snapshot.absoluteBalance = data.absoluteBalance;
        snapshot.transactionCount = data.transactionCount;
      });
    });
  }

  /**
   * Prepares a new balance snapshot record.
   */
  prepareCreate(
    workplaceId: WorkplaceId,
    data: {
      accountId: AccountId;
      transactionId: TransactionId;
      transactionDate: number;
      absoluteBalance: number;
      transactionCount: number;
    },
  ): BalanceSnapshot {
    return this.snapshots.prepareCreate(snapshot => {
      snapshot.workplaceId = workplaceId;
      snapshot.accountId = data.accountId;
      snapshot.transactionId = data.transactionId;
      snapshot.transactionDate = data.transactionDate;
      snapshot.absoluteBalance = data.absoluteBalance;
      snapshot.transactionCount = data.transactionCount;
    });
  }

  /**
   * Finds all snapshots after a given date for invalidation.
   */
  async findAfterDate(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    date: number,
  ): Promise<BalanceSnapshot[]> {
    return this.snapshots
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('account_id', accountId),
        Q.where('transaction_date', Q.gt(date)),
      )
      .fetch();
  }

  /**
   * Finds the latest snapshots for multiple accounts as of a given date.
   * Returns a Map of accountId -> SnapshotData.
   */
  async findLatestForAccountsRaw(
    workplaceId: WorkplaceId,
    accountIds: string[],
    date: number = Date.now(),
  ): Promise<Map<string, SnapshotData>> {
    const result = new Map<string, SnapshotData>();
    if (accountIds.length === 0) return result;

    const sqlAdapter = getRawAdapter(database);
    if (!sqlAdapter || typeof sqlAdapter.queryRaw !== 'function') {
      return this.findLatestForAccountsOrm(workplaceId, accountIds, date);
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
        LEFT JOIN transactions t ON bs.transaction_id = t.id AND t.workplace_id = ?
        WHERE bs.workplace_id = ?
          AND bs.account_id IN (${accountIds.map(() => '?').join(',')})
          AND bs.transaction_date <= ?
      )
      SELECT 
        accountId, transactionId, transactionDate, absoluteBalance, 
        transactionCount, createdAt, updatedAt, transactionCreatedAt
      FROM RankedSnapshots 
      WHERE rn = 1
    `;

    try {
      const rows = await sqlAdapter.queryRaw(sql, [workplaceId, workplaceId, ...accountIds, date]);
      const data = rowsFromQueryRaw(rows);
      for (const row of data) {
        if (!row || typeof row !== 'object') continue;
        const snapshot = row as SnapshotData;
        result.set(snapshot.accountId, snapshot);
      }
      return result;
    } catch (error) {
      logger.error(
        '[BalanceSnapshotRepository] findLatestForAccountsRaw failed, falling back to ORM',
        error,
      );
      return this.findLatestForAccountsOrm(workplaceId, accountIds, date);
    }
  }

  private async findLatestForAccountsOrm(
    workplaceId: WorkplaceId,
    accountIds: string[],
    date: number = Date.now(),
  ): Promise<Map<string, SnapshotData>> {
    const result = new Map<string, SnapshotData>();
    if (accountIds.length === 0) return result;

    const snapshots = await this.snapshots
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('account_id', Q.oneOf(accountIds)),
        Q.where('transaction_date', Q.lte(date)),
        Q.sortBy('transaction_date', Q.desc),
        Q.sortBy('created_at', Q.desc),
      )
      .fetch();

    const transactionsTable = database.collections.get<Transaction>('transactions');
    const seenAccounts = new Set<string>();

    for (const snap of snapshots) {
      if (seenAccounts.has(snap.accountId)) continue;
      seenAccounts.add(snap.accountId);

      let txCreatedAt: number | undefined;
      if (snap.transactionId) {
        try {
          const tx = await transactionsTable.find(snap.transactionId);
          if (tx && tx.workplaceId === workplaceId && !tx.deletedAt) {
            txCreatedAt =
              tx.createdAt instanceof Date ? tx.createdAt.getTime() : Number(tx.createdAt || 0);
          }
        } catch {
          // Transaction not found or deleted
        }
      }

      result.set(snap.accountId, {
        id: snap.id,
        accountId: snap.accountId,
        transactionId: snap.transactionId,
        transactionDate: snap.transactionDate,
        absoluteBalance: snap.absoluteBalance,
        transactionCount: snap.transactionCount,
        createdAt:
          snap.createdAt instanceof Date ? snap.createdAt.getTime() : Number(snap.createdAt || 0),
        updatedAt:
          snap.updatedAt instanceof Date ? snap.updatedAt.getTime() : Number(snap.updatedAt || 0),
        transactionCreatedAt: txCreatedAt,
      });
    }

    return result;
  }

  /**
   * Deletes all snapshots for an account after a certain date.
   * Useful when segments are invalidated.
   */
  async deleteAfterDate(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    date: number,
  ): Promise<void> {
    const snapshotsToDelete = await this.snapshots
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('account_id', accountId),
        Q.where('transaction_date', Q.gt(date)),
      )
      .fetch();

    if (snapshotsToDelete.length > 0) {
      await database.write(async () => {
        await database.batch(snapshotsToDelete.map(s => s.prepareDestroyPermanently()));
      });
    }
  }

  /**
   * Prepares WatermelonDB operations to delete balance snapshots for multiple accounts.
   */
  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Promise<BalanceSnapshot[]> {
    const snapshots = await this.snapshots
      .query(Q.where('workplace_id', workplaceId), Q.where('account_id', Q.oneOf(accountIds)))
      .fetch();
    return snapshots.map(s => s.prepareDestroyPermanently());
  }
}

/**
 * Plain object representing a balance snapshot data.
 */
export interface SnapshotData {
  id: string;
  accountId: AccountId;
  transactionId: TransactionId;
  transactionDate: number;
  absoluteBalance: number;
  transactionCount: number;
  createdAt: number;
  updatedAt: number;
  transactionCreatedAt?: number;
}

export const balanceSnapshotRepository = new BalanceSnapshotRepository();
