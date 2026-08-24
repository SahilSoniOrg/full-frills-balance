import { database } from '@/src/data/database/Database';
import { Model } from '@nozbe/watermelondb';

export type BatchOpsInput =
  | Model[]
  | readonly Model[]
  | (() => Model[] | readonly Model[] | Promise<Model[] | readonly Model[]>);

/**
 * One writer for database batch operations. Supports either a pre-built array of Models
 * or a factory function `() => Model[]` evaluated synchronously inside `database.write`
 * to avoid premature `prepareUpdate` diagnostic errors during concurrent queue waits.
 *
 * `afterBatch` runs after the write promise resolves successfully (rebuild enqueue).
 * Callers must run MMKV/analytics after this promise resolves so a thrown write cannot
 * ack an uncommitted mutation.
 */
export async function persistBatch(
  opsOrFactory: BatchOpsInput,
  afterBatch?: () => void,
): Promise<void> {
  const didPersist = await database.write(async () => {
    const rawOps = typeof opsOrFactory === 'function' ? opsOrFactory() : opsOrFactory;
    const ops = rawOps instanceof Promise ? await rawOps : rawOps;
    if (!ops || ops.length === 0) return false;
    await database.batch(ops as Model[]);
    return true;
  });

  if (didPersist) afterBatch?.();
}
