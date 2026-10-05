import { database } from '@/src/data/database/Database';
import { Model } from '@nozbe/watermelondb';

/**
 * One writer for database batch operations. The factory runs synchronously inside
 * `database.write` to avoid premature `prepareUpdate` diagnostic errors during concurrent queue waits.
 *
 * `afterBatch` runs after the write promise resolves successfully (rebuild enqueue).
 * Callers must run MMKV/analytics after this promise resolves so a thrown write cannot
 * ack an uncommitted mutation.
 */
export async function persistBatch(
  opsFactory: () => Model[] | readonly Model[],
  afterBatch?: () => void,
): Promise<void> {
  const didPersist = await database.write(async () => {
    const ops = opsFactory();
    if (!ops || ops.length === 0) return false;
    await database.batch(ops as Model[]);
    return true;
  });

  if (didPersist) afterBatch?.();
}
