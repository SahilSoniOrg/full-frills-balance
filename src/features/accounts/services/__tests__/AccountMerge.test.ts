import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { mergeAccounts } from '@/src/services/accounts/accountMergeCommands';
import { assertNoLiveAccountReferences } from '@/src/services/accounts/accountReferenceGraph';
import { logger } from '@/src/utils/logger';

jest.mock('@/src/services/RebuildQueueService');
jest.mock('@/src/services/analytics');
jest.mock('@/src/services/accounts/accountReferenceGraph', () => ({
  ...jest.requireActual('@/src/services/accounts/accountReferenceGraph'),
  assertNoLiveAccountReferences: jest.fn(),
}));

describe('mergeAccounts command', () => {
  const workplaceId = 'test-wp' as WorkplaceId;

  beforeEach(async () => {
    jest.restoreAllMocks();
    (assertNoLiveAccountReferences as jest.Mock).mockResolvedValue(undefined);
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  it('deduplicates sources and routes each reference group through its typed session method', async () => {
    const target = await accountWriteRepository.create({
      name: 'Target',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const sourceOne = await accountWriteRepository.create({
      name: 'Source one',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const sourceTwo = await accountWriteRepository.create({
      name: 'Source two',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const sourceIds = [sourceOne.id, sourceTwo.id] as AccountId[];
    const journalSpy = jest.spyOn(
      journalPersistenceRepository,
      'retargetAccountsForMergeInSession',
    );
    const plannedPaymentSpy = jest.spyOn(plannedPaymentRepository, 'mergeAccountsInSession');
    const smsRuleSpy = jest.spyOn(transactionAutoPostRuleRepository, 'mergeAccountsInSession');
    const budgetSpy = jest.spyOn(budgetRepository, 'mergeAccountsInSession');
    const accountSpy = jest.spyOn(accountWriteRepository, 'mergeInSession');
    const snapshotSpy = jest.spyOn(balanceSnapshotRepository, 'deleteForAccountMergeInSession');
    const batchSpy = jest.spyOn(database, 'batch');

    await mergeAccounts(workplaceId, target.id, [
      sourceIds[0],
      sourceIds[1],
      sourceIds[0],
      target.id,
    ]);

    for (const repositorySpy of [
      journalSpy,
      plannedPaymentSpy,
      smsRuleSpy,
      budgetSpy,
      accountSpy,
    ]) {
      expect(repositorySpy).toHaveBeenCalledWith(
        expect.anything(),
        workplaceId,
        sourceIds,
        target.id,
      );
    }
    expect(snapshotSpy).toHaveBeenCalledWith(expect.anything(), workplaceId, [
      ...sourceIds,
      target.id,
    ]);
    expect(batchSpy).toHaveBeenCalledTimes(1);
  });

  it('reports a post-commit reference invariant failure without rejecting a completed merge', async () => {
    const target = await accountWriteRepository.create({
      name: 'Target',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const source = await accountWriteRepository.create({
      name: 'Source',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    (assertNoLiveAccountReferences as jest.Mock).mockRejectedValueOnce(
      new Error('stale reference'),
    );

    await expect(mergeAccounts(workplaceId, target.id, [source.id])).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Post-merge reference invariant failed'),
      expect.any(Error),
      expect.objectContaining({ targetAccountId: target.id }),
    );
  });
});
