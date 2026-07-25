import { database } from '@/src/data/database/Database';
import { Q } from '@nozbe/watermelondb';
import { getRawAdapter } from '../database/DatabaseUtils';
import { logger } from '@/src/utils/logger';
import { WorkplaceId } from '@/src/types/domain';

export class DatabaseRepository {
  async resetDatabase(): Promise<void> {
    // unsafeResetDatabase MUST be wrapped in a write() block (Writer)
    await database.write(async () => {
      // Manual purge of workplaces as a safety measure before full reset
      try {
        const workplaces = await database.collections.get('workplaces').query().fetch();
        if (workplaces.length > 0) {
          await database.batch(workplaces.map(w => w.prepareDestroyPermanently()));
        }
      } catch (err) {
        logger.error('[DatabaseRepository] Pre-reset workplace purge failed', err);
      }

      await database.unsafeResetDatabase();
    });
  }

  async cleanupDeletedRecords(tables: string[]): Promise<number> {
    let totalDeleted = 0;
    await database.write(async () => {
      // Parallelize fetching of deleted records across tables
      const results = await Promise.all(
        tables.map(async table => {
          const deletedRecords = await database.collections
            .get(table)
            .query(Q.where('deleted_at', Q.notEq(null)))
            .fetch();
          return { table, deletedRecords };
        }),
      );

      const batchOps: any[] = [];
      for (const { deletedRecords } of results) {
        const purgeable = deletedRecords.filter(
          (record: any) => record?._raw?._status === 'synced',
        );
        totalDeleted += purgeable.length;
        if (purgeable.length > 0) {
          batchOps.push(...purgeable.map((record: any) => record.prepareDestroyPermanently()));
        }
      }

      if (batchOps.length > 0) {
        await database.batch(batchOps);
      }
    });
    return totalDeleted;
  }

  async purgeWorkplaceData(workplaceId: WorkplaceId, tables: string[]): Promise<void> {
    await database.write(async () => {
      // 1. Try high-performance raw SQL delete first (O(Tables) vs O(Records))
      // This ensures all records (including soft-deleted ones hidden from ORM) are purged.
      const adapter = getRawAdapter(database);
      if (adapter && typeof adapter.queryRaw === 'function') {
        // Sequentially execute raw SQL deletes to avoid SQLITE_BUSY locks
        for (const table of tables) {
          try {
            await adapter.queryRaw(`DELETE FROM ${table} WHERE workplace_id = ?`, [workplaceId]);
          } catch (err) {
            // Ignore "no such table" errors during reset - common after migrations
            const errorMsg = String(err);
            if (!errorMsg.includes('no such table')) {
              logger.error(`[DatabaseRepository] Failed to purge table ${table}`, err);
              throw err;
            }
          }
        }
        logger.info(
          `[DatabaseRepository] Purged ${tables.length} tables for workplace ${workplaceId} using raw SQL.`,
        );
        return;
      }

      // 2. Fallback to ORM loop (slower, but works in all environments)
      logger.warn(
        '[DatabaseRepository] purgeWorkplaceData falling back to ORM loop. Performance and integrity risk.',
      );

      // Parallelize fetching of records to be purged
      const results = await Promise.all(
        tables.map(async table => {
          const records = await database.collections
            .get(table)
            .query(Q.where('workplace_id', workplaceId))
            .fetch();
          return records;
        }),
      );

      const batchOps = results.flat().map((record: any) => record.prepareDestroyPermanently());

      if (batchOps.length > 0) {
        await database.batch(batchOps);
      }
    });
  }

  /**
   * Atomically replaces target workplace ledger data with rows currently stored under staging.
   * Purges the target first, then reassigns all staging rows to the target workplace_id.
   */
  async swapStagedWorkplaceInto(
    targetWorkplaceId: WorkplaceId,
    stagingWorkplaceId: WorkplaceId,
    tables: readonly string[],
  ): Promise<void> {
    await database.write(async () => {
      const adapter = getRawAdapter(database);
      if (adapter && typeof adapter.queryRaw === 'function') {
        for (const table of tables) {
          try {
            await adapter.queryRaw(`DELETE FROM ${table} WHERE workplace_id = ?`, [
              targetWorkplaceId,
            ]);
          } catch (err) {
            const errorMsg = String(err);
            if (!errorMsg.includes('no such table')) {
              logger.error(`[DatabaseRepository] Failed to purge ${table} before import swap`, err);
              throw err;
            }
          }
        }
        for (const table of tables) {
          try {
            await adapter.queryRaw(`UPDATE ${table} SET workplace_id = ? WHERE workplace_id = ?`, [
              targetWorkplaceId,
              stagingWorkplaceId,
            ]);
          } catch (err) {
            const errorMsg = String(err);
            if (!errorMsg.includes('no such table')) {
              logger.error(
                `[DatabaseRepository] Failed to reassign ${table} during import swap`,
                err,
              );
              throw err;
            }
          }
        }
        logger.info(
          `[DatabaseRepository] Swapped staged import ${stagingWorkplaceId} → ${targetWorkplaceId}.`,
        );
        return;
      }

      logger.warn(
        '[DatabaseRepository] swapStagedWorkplaceInto falling back to ORM (purge + update).',
      );
      const batchOps: any[] = [];
      for (const table of tables) {
        const targetRecords = await database.collections
          .get(table)
          .query(Q.where('workplace_id', targetWorkplaceId))
          .fetch();
        batchOps.push(...targetRecords.map((record: any) => record.prepareDestroyPermanently()));
      }
      for (const table of tables) {
        const stagingRecords = await database.collections
          .get(table)
          .query(Q.where('workplace_id', stagingWorkplaceId))
          .fetch();
        batchOps.push(
          ...stagingRecords.map((record: any) =>
            record.prepareUpdate((r: any) => {
              r.workplaceId = targetWorkplaceId;
            }),
          ),
        );
      }
      if (batchOps.length > 0) {
        await database.batch(batchOps);
      }
    });
  }
}

export const databaseRepository = new DatabaseRepository();
