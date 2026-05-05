import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { WorkplaceId } from '@/src/types/domain';

describe('AccountRepository Month Boundary', () => {
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

    const rawItems = await accountRepository.getAccountListItemsRaw(
      startOfMonth,
      endOfMonth,
      'test-wp' as WorkplaceId,
    );
    console.log('Raw Items JSON:', JSON.stringify(rawItems, null, 2));
  });
});
