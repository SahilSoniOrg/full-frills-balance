import { database } from '@/src/data/database/Database';
import { storage } from '@/src/data/storage/storage';

export async function resetDatabase(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
  // MMKV outlives the DB reset. Clear it so insight caches (and similar) cannot
  // leak unbalanced-journal results across database-backed tests.
  storage.clearAll();
}
