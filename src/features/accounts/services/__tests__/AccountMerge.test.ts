import { database } from '@/src/data/database/Database';
import { AccountType, AccountId, WorkplaceId } from '@/src/types/domain';

import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { preparePlannedPaymentMergeOperations } from '@/src/services/planned-payment/plannedPaymentMergeOperations';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { mergeAccounts } from '@/src/services/accounts/accountMergeCommands';

jest.mock('@/src/data/repositories/transaction');
jest.mock('@/src/services/planned-payment/plannedPaymentMergeOperations');
jest.mock('@/src/data/repositories/TransactionAutoPostRuleRepository');
jest.mock('@/src/services/budget/budgetWriteService');
jest.mock('@/src/data/repositories/BalanceSnapshotRepository');
jest.mock('@/src/services/RebuildQueueService');
jest.mock('@/src/services/analytics-service');
jest.mock('@/src/services/audit-service');

describe('mergeAccounts command', () => {
  const workplaceId = 'test-wp' as WorkplaceId;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations to return empty arrays
    (transactionQueryRepository.findAllByAccountIds as jest.Mock).mockResolvedValue([]);
    (preparePlannedPaymentMergeOperations as jest.Mock).mockResolvedValue([]);
    (transactionAutoPostRuleRepository.prepareMergeOperations as jest.Mock).mockResolvedValue([]);
    (budgetWriteService.prepareMergeOperations as jest.Mock).mockResolvedValue([]);
    (balanceSnapshotRepository.prepareMergeOperations as jest.Mock).mockResolvedValue([]);
  });

  test('calls transactionQueryRepository.findAllByAccountIds with deduplicated sources (excluding target)', async () => {
    const targetId = 'target' as AccountId;
    const sourceIds = ['source1', 'source2', 'source1', 'target'] as AccountId[];

    const mockAccount = (id: string) => ({
      id,
      workplaceId,
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });

    // Mock repository
    jest
      .spyOn(accountQueryRepository, 'find')
      .mockImplementation(
        async (_wp: WorkplaceId, id: AccountId) => mockAccount(id as string) as any,
      );
    jest
      .spyOn(accountQueryRepository, 'findAllByIds')
      .mockImplementation(
        async (_wp: WorkplaceId, ids: AccountId[]) =>
          ids.map(id => mockAccount(id as string)) as any,
      );
    jest.spyOn(accountWriteRepository, 'prepareMergeOperations').mockResolvedValue([]);

    // Mock database write
    jest.spyOn(database, 'write').mockImplementation(async (fn: any) => fn());
    jest.spyOn(database, 'batch').mockResolvedValue(undefined);

    await mergeAccounts(workplaceId, targetId, sourceIds);

    // Verify transactionQueryRepository.findAllByAccountIds was called with deduplicated source1 and source2, but not target
    const expectedSources = ['source1', 'source2'];

    expect(transactionQueryRepository.findAllByAccountIds).toHaveBeenCalledWith(
      workplaceId,
      expect.arrayContaining(expectedSources),
    );
    const callArgs = (transactionQueryRepository.findAllByAccountIds as jest.Mock).mock.calls[0][1];
    expect(callArgs.length).toBe(2);
    expect(callArgs).toContain('source1');
    expect(callArgs).toContain('source2');
    expect(callArgs).not.toContain('target');
  });

  test('invokes rewrite preparers for every retarget/destroy referenceSites entry', async () => {
    const targetId = 'target' as AccountId;
    const sourceIds = ['source1'] as AccountId[];

    const mockAccount = (id: string) => ({
      id,
      workplaceId,
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });

    jest
      .spyOn(accountQueryRepository, 'find')
      .mockImplementation(
        async (_wp: WorkplaceId, id: AccountId) => mockAccount(id as string) as any,
      );
    jest
      .spyOn(accountQueryRepository, 'findAllByIds')
      .mockImplementation(
        async (_wp: WorkplaceId, ids: AccountId[]) =>
          ids.map(id => mockAccount(id as string)) as any,
      );
    jest.spyOn(accountWriteRepository, 'prepareMergeOperations').mockResolvedValue([]);
    jest.spyOn(database, 'write').mockImplementation(async (fn: any) => fn());
    jest.spyOn(database, 'batch').mockResolvedValue(undefined);

    await mergeAccounts(workplaceId, targetId, sourceIds);

    expect(transactionQueryRepository.findAllByAccountIds).toHaveBeenCalled();
    expect(preparePlannedPaymentMergeOperations).toHaveBeenCalled();
    expect(transactionAutoPostRuleRepository.prepareMergeOperations).toHaveBeenCalled();
    expect(budgetWriteService.prepareMergeOperations).toHaveBeenCalled();
    expect(accountWriteRepository.prepareMergeOperations).toHaveBeenCalled();
    expect(balanceSnapshotRepository.prepareMergeOperations).toHaveBeenCalledWith(
      workplaceId,
      expect.arrayContaining(['source1', 'target']),
    );
  });
});
