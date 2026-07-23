import { Model, Database } from '@nozbe/watermelondb';

export const DEFAULT_BATCH_CHUNK_SIZE = 100;

/**
 * Executes WatermelonDB batch model operations in bounded transaction chunks
 * to prevent main thread blocking and bridge freezes during large ingestion scans.
 */
export async function executeBoundedBatchWrite(
  db: Database,
  ops: Model[],
  chunkSize: number = DEFAULT_BATCH_CHUNK_SIZE,
): Promise<void> {
  if (!ops || ops.length === 0) return;

  const validChunkSize = Math.max(1, chunkSize);

  for (let i = 0; i < ops.length; i += validChunkSize) {
    const chunk = ops.slice(i, i + validChunkSize);
    await db.write(async () => {
      await db.batch(chunk);
    });
  }
}
