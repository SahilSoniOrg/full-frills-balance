import { database } from '@/src/data/database/Database';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import {
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { AccountId, TransactionId, WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import Transaction from '@/src/data/models/Transaction';
import { rawSqlExecutor } from './raw/RawSqlExecutor';

export class BalanceSnapshotRepository {
  private get snapshots() {
    return database.collections.get<BalanceSnapshot>('balance_snapshots');
  }

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
      const snapshot = this.prepareCreate(workplaceId, data);
      await database.batch(snapshot);
      return snapshot;
    });
  }

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
   * Prepares deletion of an invalidated snapshot for an account owned by the workplace.
   * The caller owns the write and is responsible for batching the prepared operation.
   */
  prepareDeleteForAccount(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    snapshot: BalanceSnapshot,
  ): BalanceSnapshot {
    if (snapshot.workplaceId !== workplaceId || snapshot.accountId !== accountId) {
      throw new Error('Balance snapshot does not belong to the specified account and workplace');
    }

    return snapshot.prepareDestroyPermanently();
  }

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

  async findLatestForAccountsRaw(
    workplaceId: WorkplaceId,
    accountIds: string[],
    date: number = Date.now(),
  ): Promise<Map<string, SnapshotData>> {
    const result = new Map<string, SnapshotData>();
    if (accountIds.length === 0) return result;

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
      const rows = await rawSqlExecutor.query<SnapshotData>(sql, [
        workplaceId,
        workplaceId,
        ...accountIds,
        date,
      ]);
      if (rows === null) return this.findLatestForAccountsOrm(workplaceId, accountIds, date);
      for (const snapshot of rows) {
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
   * Prepares WatermelonDB operations to delete balance snapshots for multiple accounts.
   */
  async deleteForAccountMergeInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Promise<void> {
    const snapshots = await this.loadMergeRecords(workplaceId, accountIds);
    stageModelWrite(session, () => this.prepareLoadedMergeOperations(snapshots));
  }

  private loadMergeRecords(workplaceId: WorkplaceId, accountIds: AccountId[]) {
    return this.snapshots
      .query(Q.where('workplace_id', workplaceId), Q.where('account_id', Q.oneOf(accountIds)))
      .fetch();
  }

  private prepareLoadedMergeOperations(snapshots: BalanceSnapshot[]): BalanceSnapshot[] {
    return snapshots.map(s => s.prepareDestroyPermanently());
  }
}

/**
 * Plain object representing a balance snapshot data.
 */
interface SnapshotData {
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
