import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { transactionWriteRepository } from '@/src/data/repositories/transaction';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { mergeAccounts } from '@/src/services/accounts/accountMergeCommands';

jest.mock('@/src/data/repositories/transaction');
jest.mock('@/src/data/repositories/TransactionAutoPostRuleRepository');
jest.mock('@/src/data/repositories/BalanceSnapshotRepository');
jest.mock('@/src/services/RebuildQueueService');
jest.mock('@/src/services/analytics');
jest.mock('@/src/services/audit-service');

describe('mergeAccounts command', () => {
  const workplaceId = 'test-wp' as WorkplaceId;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations to return empty arrays
    (transactionWriteRepository.prepareMergeOperations as jest.Mock).mockResolvedValue([]);
    jest.spyOn(plannedPaymentRepository, 'prepareMergeOperations').mockResolvedValue([]);
    (transactionAutoPostRuleRepository.prepareMergeOperations as jest.Mock).mockResolvedValue([]);
    jest.spyOn(budgetRepository, 'prepareMergeOperations').mockResolvedValue([]);
    (balanceSnapshotRepository.prepareMergeOperations as jest.Mock).mockResolvedValue([]);
  });

  test('calls transactionWriteRepository.prepareMergeOperations with deduplicated sources (excluding target)', async () => {
    const targetId = 'target' as AccountId;
    const sourceIds = ['source1', 'source2', 'source1', 'target'] as AccountId[];

    const mockAccount = (id: string) => ({
      id,
      workplaceId,
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });

    // Mock repositories
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

    expect(transactionWriteRepository.prepareMergeOperations).toHaveBeenCalledWith(
      workplaceId,
      ['source1', 'source2'],
      targetId,
    );
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

    expect(transactionWriteRepository.prepareMergeOperations).toHaveBeenCalled();
    expect(plannedPaymentRepository.prepareMergeOperations).toHaveBeenCalled();
    expect(transactionAutoPostRuleRepository.prepareMergeOperations).toHaveBeenCalled();
    expect(budgetRepository.prepareMergeOperations).toHaveBeenCalled();
    expect(accountWriteRepository.prepareMergeOperations).toHaveBeenCalled();
    expect(balanceSnapshotRepository.prepareMergeOperations).toHaveBeenCalledWith(
      workplaceId,
      expect.arrayContaining(['source1', 'target']),
    );
  });
});
