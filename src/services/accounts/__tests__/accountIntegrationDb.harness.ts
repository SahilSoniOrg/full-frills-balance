import { database } from '@/src/data/database/Database';
import { WorkplaceId } from '@/src/types/ids';

export const ACCOUNT_CMD_WORKPLACE_ID = 'wp-acct-cmd' as WorkplaceId;
export const ACCOUNT_REPO_WORKPLACE_ID = 'test-wp-1' as WorkplaceId;
export const ACCOUNT_MERGE_WORKPLACE_ID = 'test-wp' as WorkplaceId;

export async function resetAccountsIntegrationDatabase(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}
