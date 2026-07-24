import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { ledgerWriteService } from '@/src/services/ledger';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';

const workplaceId = 'wp-1' as WorkplaceId;

describe('ledgerWriteService lifecycle', () => {
  let cashAccountId: AccountId;
  let expenseAccountId: AccountId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    const cash = await accountRepository.create({
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const expense = await accountRepository.create({
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId,
    });
    cashAccountId = cash.id as AccountId;
    expenseAccountId = expense.id as AccountId;
  }, 30000);

  afterAll(() => {
    rebuildQueueService.stop();
  });

  async function createPlannedJournal(plannedDate: number): Promise<Journal> {
    return ledgerWriteService.createJournal(
      {
        description: 'Planned expense',
        journalDate: plannedDate,
        currencyCode: 'USD',
        status: JournalStatus.PLANNED,
        transactions: [
          {
            accountId: cashAccountId,
            amount: 50,
            transactionType: TransactionType.CREDIT,
          },
          {
            accountId: expenseAccountId,
            amount: 50,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      workplaceId,
    );
  }

  describe('postJournal', () => {
    it('changes PLANNED journal status to POSTED', async () => {
      const plannedDate = Date.UTC(2024, 5, 15, 12, 0, 0);
      const journal = await createPlannedJournal(plannedDate);
      expect(journal.status).toBe(JournalStatus.PLANNED);

      const beforePost = Date.now();
      await ledgerWriteService.postJournal(journal.id as JournalId, workplaceId);
      await rebuildQueueService.flush();

      const updated = await journalRepository.find(workplaceId, journal.id as JournalId);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe(JournalStatus.POSTED);
      expect(updated!.journalDate).toBeGreaterThanOrEqual(beforePost);
    });

    it('rejects posting a journal that is not PLANNED', async () => {
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'Already posted',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId,
              amount: 10,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId,
              amount: 10,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        workplaceId,
      );
      expect(journal.status).toBe(JournalStatus.POSTED);

      await expect(
        ledgerWriteService.postJournal(journal.id as JournalId, workplaceId),
      ).rejects.toThrow(/Only PLANNED journals can be posted/);
    });
  });

  describe('revertToPlanned', () => {
    it('changes POSTED journal status back to PLANNED with original planned date', async () => {
      const plannedDate = Date.UTC(2024, 5, 15, 12, 0, 0);
      const journal = await createPlannedJournal(plannedDate);
      await ledgerWriteService.postJournal(journal.id as JournalId, workplaceId);

      await ledgerWriteService.revertToPlanned(journal.id as JournalId, workplaceId);
      await rebuildQueueService.flush();

      const updated = await journalRepository.find(workplaceId, journal.id as JournalId);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe(JournalStatus.PLANNED);
      expect(updated!.journalDate).toBe(plannedDate);
    });

    it('rejects reverting a journal that is not POSTED or SKIPPED', async () => {
      const journal = await createPlannedJournal(Date.now());
      expect(journal.status).toBe(JournalStatus.PLANNED);

      await expect(
        ledgerWriteService.revertToPlanned(journal.id as JournalId, workplaceId),
      ).rejects.toThrow(/Only POSTED or SKIPPED journals can be reverted/);
    });
  });

  describe('recoverJournal', () => {
    it('clears soft-delete and makes journal visible again', async () => {
      const journal = await createPlannedJournal(Date.now());
      const journalId = journal.id as JournalId;

      await ledgerWriteService.deleteJournal(journalId, workplaceId);
      expect(await journalRepository.find(workplaceId, journalId)).toBeNull();

      const deleted = await journalRepository.findWithDeleted(workplaceId, journalId);
      expect(deleted?.deletedAt).toBeDefined();

      await ledgerWriteService.recoverJournal(journalId, workplaceId);
      await rebuildQueueService.flush();

      const restored = await journalRepository.find(workplaceId, journalId);
      expect(restored).not.toBeNull();
      expect(restored!.deletedAt).toBeFalsy();
      expect(restored!.status).toBe(JournalStatus.PLANNED);
    });

    it('throws when journal does not exist', async () => {
      await expect(
        ledgerWriteService.recoverJournal('missing-id' as JournalId, workplaceId),
      ).rejects.toThrow(/Journal not found/);
    });
  });
});
