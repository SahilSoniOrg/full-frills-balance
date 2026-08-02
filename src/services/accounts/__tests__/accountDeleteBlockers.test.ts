import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { collectAccountDeleteBlockers } from '@/src/services/accounts/accountDeleteBlockers';
import { AccountId, WorkplaceId } from '@/src/types/domain';

jest.mock('@/src/data/repositories/AccountRepository', () => ({
  accountRepository: {
    queryByParentId: jest.fn(),
    findMetadataByPayFromAccountIds: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/BudgetRepository', () => ({
  budgetRepository: {
    findAllScopesByAccountIds: jest.fn(),
    findAllReferencingAssetAccountId: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/PlannedPaymentRepository', () => ({
  plannedPaymentRepository: {
    findAllByFromAccountIds: jest.fn(),
    findAllByToAccountIds: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/TransactionAutoPostRuleRepository', () => ({
  transactionAutoPostRuleRepository: {
    findAllReferencingAccountIds: jest.fn(),
  },
}));

describe('collectAccountDeleteBlockers', () => {
  const workplaceId = 'wp-1' as WorkplaceId;
  const accountId = 'acc-1' as AccountId;

  beforeEach(() => {
    jest.clearAllMocks();
    (accountRepository.queryByParentId as jest.Mock).mockReturnValue({
      fetch: jest.fn().mockResolvedValue([]),
    });
    (budgetRepository.findAllScopesByAccountIds as jest.Mock).mockResolvedValue([]);
    (budgetRepository.findAllReferencingAssetAccountId as jest.Mock).mockResolvedValue([]);
    (plannedPaymentRepository.findAllByFromAccountIds as jest.Mock).mockResolvedValue([]);
    (plannedPaymentRepository.findAllByToAccountIds as jest.Mock).mockResolvedValue([]);
    (accountRepository.findMetadataByPayFromAccountIds as jest.Mock).mockResolvedValue([]);
    (transactionAutoPostRuleRepository.findAllReferencingAccountIds as jest.Mock).mockResolvedValue(
      [],
    );
  });

  it('returns empty when nothing references the account', async () => {
    await expect(collectAccountDeleteBlockers(workplaceId, accountId)).resolves.toEqual([]);
  });

  it('lists each dependent reference type', async () => {
    (accountRepository.queryByParentId as jest.Mock).mockReturnValue({
      fetch: jest.fn().mockResolvedValue([{ id: 'child' }]),
    });
    (budgetRepository.findAllScopesByAccountIds as jest.Mock).mockResolvedValue([{ id: 'scope' }]);
    (budgetRepository.findAllReferencingAssetAccountId as jest.Mock).mockResolvedValue([
      { id: 'b1', assetAccountIds: 'acc-1,acc-2' },
    ]);
    (plannedPaymentRepository.findAllByFromAccountIds as jest.Mock).mockResolvedValue([
      { id: 'pp1' },
    ]);
    (accountRepository.findMetadataByPayFromAccountIds as jest.Mock).mockResolvedValue([
      { id: 'meta' },
    ]);
    (transactionAutoPostRuleRepository.findAllReferencingAccountIds as jest.Mock).mockResolvedValue(
      [{ id: 'rule' }],
    );

    const blockers = await collectAccountDeleteBlockers(workplaceId, accountId);
    expect(blockers).toEqual([
      '1 child account(s)',
      '1 budget scope(s)',
      '1 budget funding account list(s)',
      '1 planned payment(s)',
      '1 pay-from metadata reference(s)',
      '1 SMS auto-post rule(s)',
    ]);
  });
});
