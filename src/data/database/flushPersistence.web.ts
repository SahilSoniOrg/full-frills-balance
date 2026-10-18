import { database } from './Database';

/** Loki batches mutate memory; only the IndexedDB save callback acknowledges persistence. */
export async function flushDatabasePersistence(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    void database.adapter
      .unsafeExecute({
        loki: loki => {
          loki.saveDatabase((error?: Error | null) => {
            if (error) reject(error);
            else resolve();
          });
        },
      })
      .catch(reject);
  });
}
