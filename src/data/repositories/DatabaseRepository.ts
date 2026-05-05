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
      for (const table of tables) {
        const deletedRecords = await database.collections
          .get(table)
          .query(Q.where('deleted_at', Q.notEq(null)))
          .fetch();
        const purgeable = deletedRecords.filter(
          (record: any) => record?._raw?._status === 'synced',
        );
        totalDeleted += purgeable.length;
        if (purgeable.length > 0) {
          await database.batch(purgeable.map((record: any) => record.prepareDestroyPermanently()));
        }
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
        for (const table of tables) {
          // Use unsafeQueryRaw to execute DELETE
          await adapter.queryRaw(`DELETE FROM ${table} WHERE workplace_id = ?`, [workplaceId]);
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
      for (const table of tables) {
        const records = await database.collections
          .get(table)
          .query(Q.where('workplace_id', workplaceId))
          .fetch();
        if (records.length > 0) {
          await database.batch(records.map((record: any) => record.prepareDestroyPermanently()));
        }
      }
    });
  }
}

export const databaseRepository = new DatabaseRepository();
