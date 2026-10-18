import { Q } from '@nozbe/watermelondb';
import { map } from 'rxjs';
import { database } from '@/src/data/database/Database';
import { flushDatabasePersistence } from '@/src/data/database/flushPersistence';
import Workplace from '@/src/data/models/Workplace';
import type { WorkplaceId } from '@/src/types/ids';

export type PendingRestoreCompletion = Readonly<{
  workplaceId: WorkplaceId;
  manifestHash: string | null;
  json: string;
}>;

export class RestoreCompletionRepository {
  private pending() {
    return database
      .get<Workplace>('workplaces')
      .query(Q.where('row_restore_completion_json', Q.notEq(null)));
  }

  observePending() {
    return this.pending()
      .observeWithColumns(['row_restore_completion_json'])
      .pipe(
        // Watermelon models are mutable; subscribers need immutable snapshots.
        map(rows =>
          rows.map(row => ({
            workplaceId: row.id,
            manifestHash: row.rowRestoreManifestHash,
            json: row.rowRestoreCompletionJson!,
          })),
        ),
      );
  }

  async readPending(): Promise<PendingRestoreCompletion[]> {
    return (await this.pending().fetch()).map(row => ({
      workplaceId: row.id,
      manifestHash: row.rowRestoreManifestHash,
      json: row.rowRestoreCompletionJson!,
    }));
  }

  async confirmPublication(): Promise<void> {
    // An observed Loki batch may still exist only in memory after a failed save.
    await database.write(() => flushDatabasePersistence());
  }

  async clear(pending: PendingRestoreCompletion): Promise<void> {
    await database.write(async () => {
      const row = await database.get<Workplace>('workplaces').find(pending.workplaceId);
      if (
        row.rowRestoreManifestHash !== pending.manifestHash ||
        row.rowRestoreCompletionJson !== pending.json
      )
        throw new Error('Restore completion changed before acknowledgement');
      const updatedAt = row.updatedAt;
      await row.update(value => {
        value.rowRestoreCompletionJson = null;
        // Watermelon touches updated_at on every update. This device-only marker must
        // not change the financial Workplace row or cause an incremental sync change.
        value.updatedAt = updatedAt;
      });
      try {
        await flushDatabasePersistence();
      } catch (error) {
        // Keep the in-memory gate closed too when IndexedDB did not acknowledge the clear.
        await row.update(value => {
          value.rowRestoreCompletionJson = pending.json;
          value.updatedAt = updatedAt;
        });
        throw error;
      }
    });
  }
}

export const restoreCompletionRepository = new RestoreCompletionRepository();
