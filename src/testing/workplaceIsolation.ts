import { database } from '@/src/data/database/Database';
import { WorkplaceId } from '@/src/types/ids';

export const WORKPLACE_ISOLATION_ONE = 'wp-rebuild-isolation-1' as WorkplaceId;
export const WORKPLACE_ISOLATION_TWO = 'wp-rebuild-isolation-2' as WorkplaceId;

export async function resetDatabaseForIsolationTests(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}
