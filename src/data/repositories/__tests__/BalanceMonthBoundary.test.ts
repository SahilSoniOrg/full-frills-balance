import { accountListMetricsQueries } from '@/src/data/repositories/account/AccountListMetricsQueries';
import { WorkplaceId } from '@/src/types/domain';

describe('AccountListMetricsQueries Month Boundary', () => {
  it('fetches correct balance', async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    ).getTime();

    const rawItems = await accountListMetricsQueries.getAccountListItemsRaw(
      startOfMonth,
      endOfMonth,
      'test-wp' as WorkplaceId,
    );
    console.log('Raw Items JSON:', JSON.stringify(rawItems, null, 2));
  });
});
