import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { assertAccountsExistInWorkplace } from '@/src/services/accounts/assertAccountsExist';
import { AccountId, WorkplaceId } from '@/src/types/domain';

jest.mock('@/src/data/repositories/AccountRepository', () => ({
  accountRepository: {
    findAllByIds: jest.fn(),
  },
}));

describe('assertAccountsExistInWorkplace', () => {
  const workplaceId = 'wp-1' as WorkplaceId;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no-ops when all ids are empty', async () => {
    await expect(
      assertAccountsExistInWorkplace(workplaceId, [undefined, null, '']),
    ).resolves.toEqual([]);
    expect(accountRepository.findAllByIds).not.toHaveBeenCalled();
  });

  it('throws when any id is missing', async () => {
    (accountRepository.findAllByIds as jest.Mock).mockResolvedValue([{ id: 'acc-1' }]);

    await expect(
      assertAccountsExistInWorkplace(
        workplaceId,
        ['acc-1' as AccountId, 'acc-gone' as AccountId],
        'Budget',
      ),
    ).rejects.toThrow('Budget references missing or deleted account(s): acc-gone');
  });

  it('accepts when every id resolves', async () => {
    (accountRepository.findAllByIds as jest.Mock).mockResolvedValue([
      { id: 'acc-1' },
      { id: 'acc-2' },
    ]);

    await expect(
      assertAccountsExistInWorkplace(workplaceId, ['acc-1' as AccountId, 'acc-2' as AccountId]),
    ).resolves.toEqual([{ id: 'acc-1' }, { id: 'acc-2' }]);
  });
});
