import { database } from '@/src/data/database/Database';
import Collection from '@nozbe/watermelondb/Collection';
import Model from '@nozbe/watermelondb/Model';
import { Q } from '@nozbe/watermelondb';
import { getRawAdapter } from '../database/DatabaseUtils';
import { logger } from '@/src/utils/logger';
import { WorkplaceId } from '@/src/types/domain';

export class DatabaseRepository {
  private getCollection<T extends Model = Model>(tableName: string): Collection<T> | undefined {
    try {
      return database.collections.get<T>(tableName);
    } catch {
      return undefined;
    }
  }

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
          const deletedRecords =
            (await this.getCollection(table)
              ?.query(Q.where('deleted_at', Q.notEq(null)))
              .fetch()) || [];
          return { table, deletedRecords };
        }),
      );

      const batchOps: Model[] = [];
      for (const { deletedRecords } of results) {
        const purgeable = deletedRecords.filter(record => record._raw._status === 'synced');
        totalDeleted += purgeable.length;
        if (purgeable.length > 0) {
          batchOps.push(...purgeable.map(record => record.prepareDestroyPermanently()));
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
          const records = await this.getCollection(table)
            ?.query(Q.where('workplace_id', workplaceId))
            .fetch();
          return records || [];
        }),
      );

      const batchOps = results.flat().map(record => record.prepareDestroyPermanently());

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
      const batchOps: Model[] = [];
      for (const table of tables) {
        const targetRecords = await this.getCollection(table)
          ?.query(Q.where('workplace_id', targetWorkplaceId))
          .fetch();
        batchOps.push(...(targetRecords || []).map(record => record.prepareDestroyPermanently()));
      }
      for (const table of tables) {
        const stagingRecords = await this.getCollection<Model & { workplaceId: WorkplaceId }>(table)
          ?.query(Q.where('workplace_id', stagingWorkplaceId))
          .fetch();
        batchOps.push(
          ...(stagingRecords || []).map(record =>
            record.prepareUpdate(r => {
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
