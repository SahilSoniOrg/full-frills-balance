import { AccountType } from '@/src/types/enums';
import { accountQueryRepository } from '@/src/data/repositories/account/AccountQueryRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import type { WorkplaceId } from '@/src/types/ids';
import { readImportedWorkplaceSummary } from '../readImportedWorkplaceSummary';

jest.mock('@/src/data/repositories/account/AccountQueryRepository', () => ({
  accountQueryRepository: { findAll: jest.fn() },
}));

jest.mock('@/src/data/repositories/WorkplaceRepository', () => ({
  workplaceRepository: { find: jest.fn() },
}));

describe('readImportedWorkplaceSummary', () => {
  const findWorkplace = workplaceRepository.find as jest.Mock;
  const findAccounts = accountQueryRepository.findAll as jest.Mock;

  beforeEach(() => jest.clearAllMocks());

  it('reads imported metadata and counts only user accounts and categories', async () => {
    findWorkplace.mockResolvedValue({
      name: 'Household 2026',
      icon: 'home',
      defaultCurrencyCode: 'EUR',
    });
    findAccounts.mockResolvedValue([
      { accountType: AccountType.ASSET },
      { accountType: AccountType.LIABILITY },
      { accountType: AccountType.INCOME },
      { accountType: AccountType.EXPENSE },
      { accountType: AccountType.EXPENSE },
      { accountType: AccountType.EQUITY },
    ]);

    await expect(
      readImportedWorkplaceSummary('imported-workplace' as WorkplaceId),
    ).resolves.toEqual({
      workplaceName: 'Household 2026',
      workplaceIcon: 'home',
      currencyCode: 'EUR',
      accountCount: 2,
      categoryCount: 3,
    });
    expect(findAccounts).toHaveBeenCalledWith('imported-workplace');
  });

  it('returns null when the staged Workplace no longer exists', async () => {
    findWorkplace.mockResolvedValue(undefined);
    findAccounts.mockResolvedValue([]);

    await expect(
      readImportedWorkplaceSummary('missing-workplace' as WorkplaceId),
    ).resolves.toBeNull();
  });
});
