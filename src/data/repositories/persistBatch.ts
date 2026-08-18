import { database } from '@/src/data/database/Database';
import { Model } from '@nozbe/watermelondb';

/**
 * One writer for already-prepared ops. `afterBatch` runs inside the write after
 * a successful batch (rebuild enqueue). Callers must run MMKV/analytics after
 * this promise resolves so a thrown write cannot ack an uncommitted mutation.
 */
export async function persistBatch(ops: Model[], afterBatch?: () => void): Promise<void> {
  if (ops.length === 0) return;
  await database.write(async () => {
    await database.batch(ops);
    afterBatch?.();
  });
}
