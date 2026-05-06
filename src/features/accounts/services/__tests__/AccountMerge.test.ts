import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionService } from '@/src/features/journal';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { smsService } from '@/src/services/sms-service';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { accountService } from '../AccountService';

jest.mock('@/src/features/journal');
jest.mock('@/src/services/PlannedPaymentService');
jest.mock('@/src/services/sms-service');
jest.mock('@/src/services/budget/budgetWriteService');
jest.mock('@/src/data/repositories/BalanceSnapshotRepository');
jest.mock('@/src/services/RebuildQueueService');
jest.mock('@/src/services/analytics-service');
jest.mock('@/src/services/audit-service');

describe('AccountService.mergeAccounts', () => {
  const workplaceId = 'test-wp' as WorkplaceId;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations to return empty arrays
    (transactionService.prepareMergeOperations as jest.Mock).mockResolvedValue([]);
    (plannedPaymentService.prepareMergeOperations as jest.Mock).mockResolvedValue([]);
    (smsService.prepareMergeOperations as jest.Mock).mockResolvedValue([]);
    (budgetWriteService.prepareMergeOperations as jest.Mock).mockResolvedValue([]);
    (balanceSnapshotRepository.prepareMergeOperations as jest.Mock).mockResolvedValue([]);
  });

  test('deduplicates source IDs and filters out target ID', async () => {
    const targetId = 'target' as AccountId;
    const sourceIds = ['target', 'source1', 'source1', 'source2'] as AccountId[];

    const mockAccount = (id: string) => ({
      id,
      workplaceId,
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });

    // Mock repository
    jest
      .spyOn(accountRepository, 'find')
      .mockImplementation(async (_wp, id) => mockAccount(id as string) as any);
    jest
      .spyOn(accountRepository, 'findAllByIds')
      .mockImplementation(async (_wp, ids) => ids.map(id => mockAccount(id as string)) as any);
    jest.spyOn(accountRepository, 'prepareMergeOperations').mockResolvedValue([]);

    // Mock database write
    jest.spyOn(database, 'write').mockImplementation(async (fn: any) => fn());
    jest.spyOn(database, 'batch').mockResolvedValue(undefined);

    await accountService.mergeAccounts(workplaceId, targetId, sourceIds);

    // Verify prepareMergeOperations was called with deduplicated source1 and source2, but not target
    const expectedSources = ['source1', 'source2'];

    expect(transactionService.prepareMergeOperations).toHaveBeenCalledWith(
      workplaceId,
      expect.arrayContaining(expectedSources),
      targetId,
    );
    const callArgs = (transactionService.prepareMergeOperations as jest.Mock).mock.calls[0][1];
    expect(callArgs.length).toBe(2);
    expect(callArgs).toContain('source1');
    expect(callArgs).toContain('source2');
    expect(callArgs).not.toContain('target');
  });
});
