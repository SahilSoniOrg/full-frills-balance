import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionWriteRepository } from '@/src/data/repositories/transaction';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { mergeAccounts } from '@/src/services/accounts/accountMergeCommands';
import { assertNoLiveAccountReferences } from '@/src/services/accounts/accountReferenceGraph';
import { logger } from '@/src/utils/logger';

jest.mock('@/src/data/repositories/transaction');
jest.mock('@/src/data/repositories/TransactionAutoPostRuleRepository');
jest.mock('@/src/data/repositories/BalanceSnapshotRepository');
jest.mock('@/src/services/RebuildQueueService');
jest.mock('@/src/services/analytics');
jest.mock('@/src/services/audit-service');
jest.mock('@/src/services/accounts/accountReferenceGraph', () => ({
  ...jest.requireActual('@/src/services/accounts/accountReferenceGraph'),
  assertNoLiveAccountReferences: jest.fn(),
}));

describe('mergeAccounts command', () => {
  const workplaceId = 'test-wp' as WorkplaceId;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations to return empty arrays
    (transactionWriteRepository.loadMergeRecords as jest.Mock).mockResolvedValue([]);
    (transactionWriteRepository.prepareLoadedMergeOperations as jest.Mock).mockReturnValue([]);
    (transactionAutoPostRuleRepository.loadMergeRecords as jest.Mock).mockResolvedValue([]);
    (transactionAutoPostRuleRepository.prepareLoadedMergeOperations as jest.Mock).mockReturnValue(
      [],
    );
    jest.spyOn(accountQueryRepository, 'findAll').mockResolvedValue([]);
    jest.spyOn(plannedPaymentRepository, 'loadMergeRecords').mockResolvedValue({
      sourceFrom: [],
      sourceTo: [],
      targetFrom: [],
      targetTo: [],
    });
    jest.spyOn(plannedPaymentRepository, 'prepareLoadedMergeOperations').mockReturnValue([]);
    jest.spyOn(budgetRepository, 'loadMergeRecords').mockResolvedValue({ scopes: [], budgets: [] });
    jest.spyOn(budgetRepository, 'prepareLoadedMergeOperations').mockReturnValue([]);
    jest.spyOn(accountWriteRepository, 'loadMergeRecords').mockResolvedValue({
      metadataToRetarget: [],
      sourceMetadata: [],
      sourceChildren: [],
      targetChildren: [],
      sourceAccounts: [],
    });
    jest.spyOn(accountWriteRepository, 'prepareLoadedMergeOperations').mockReturnValue([]);
    (balanceSnapshotRepository.loadMergeRecords as jest.Mock).mockResolvedValue([]);
    (balanceSnapshotRepository.prepareLoadedMergeOperations as jest.Mock).mockReturnValue([]);
    (assertNoLiveAccountReferences as jest.Mock).mockResolvedValue(undefined);
  });

  test('loads transactions with deduplicated sources (excluding target)', async () => {
    const targetId = 'target' as AccountId;
    const sourceIds = ['source1', 'source2', 'source1', 'target'] as AccountId[];

    const mockAccount = (id: string) => ({
      id,
      workplaceId,
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      prepareUpdate: jest.fn().mockReturnValue({}),
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
    // Mock database write
    jest.spyOn(database, 'write').mockImplementation(async (fn: any) => fn());
    jest.spyOn(database, 'batch').mockResolvedValue(undefined);

    await mergeAccounts(workplaceId, targetId, sourceIds);

    expect(transactionWriteRepository.loadMergeRecords).toHaveBeenCalledWith(workplaceId, [
      'source1',
      'source2',
    ]);
  });

  test('invokes rewrite preparers for every retarget/destroy referenceSites entry', async () => {
    const targetId = 'target' as AccountId;
    const sourceIds = ['source1'] as AccountId[];

    const mockAccount = (id: string) => ({
      id,
      workplaceId,
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      prepareUpdate: jest.fn().mockReturnValue({}),
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
    jest.spyOn(database, 'write').mockImplementation(async (fn: any) => fn());
    jest.spyOn(database, 'batch').mockResolvedValue(undefined);

    await mergeAccounts(workplaceId, targetId, sourceIds);

    expect(transactionWriteRepository.prepareLoadedMergeOperations).toHaveBeenCalled();
    expect(database.batch).toHaveBeenCalled();
  });

  test('reports a post-commit invariant failure without rejecting a completed merge', async () => {
    const targetId = 'target' as AccountId;
    const sourceId = 'source' as AccountId;
    const mockAccount = (id: AccountId) => ({
      id,
      workplaceId,
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    jest.spyOn(accountQueryRepository, 'find').mockResolvedValue(mockAccount(targetId) as any);
    jest
      .spyOn(accountQueryRepository, 'findAllByIds')
      .mockResolvedValue([mockAccount(sourceId)] as any);
    jest.spyOn(database, 'write').mockImplementation(async (fn: any) => fn());
    jest.spyOn(database, 'batch').mockResolvedValue(undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    (assertNoLiveAccountReferences as jest.Mock).mockRejectedValueOnce(
      new Error('stale reference'),
    );

    await expect(mergeAccounts(workplaceId, targetId, [sourceId])).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Post-merge reference invariant failed'),
      expect.any(Error),
      expect.objectContaining({ targetAccountId: targetId }),
    );
  });
});
