import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalMetadataRepository } from '@/src/data/repositories/journal/journalMetadataRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
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

      const updated = await journalQueryRepository.find(workplaceId, journal.id as JournalId);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe(JournalStatus.POSTED);
      expect(updated!.journalDate).toBeGreaterThanOrEqual(beforePost);
    });

    it('throws when journal does not exist', async () => {
      await expect(
        ledgerWriteService.postJournal('missing-id' as JournalId, workplaceId),
      ).rejects.toThrow(/Journal not found/);
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

      const updated = await journalQueryRepository.find(workplaceId, journal.id as JournalId);
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

    it('reverts a SKIPPED journal back to PLANNED', async () => {
      const skippedDate = Date.UTC(2024, 7, 10, 15, 30, 0);
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'Skipped bill',
          journalDate: skippedDate,
          currencyCode: 'USD',
          status: JournalStatus.SKIPPED,
          transactions: [
            {
              accountId: cashAccountId,
              amount: 40,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId,
              amount: 40,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        workplaceId,
      );

      await ledgerWriteService.revertToPlanned(journal.id as JournalId, workplaceId);
      await rebuildQueueService.flush();

      const updated = await journalQueryRepository.find(workplaceId, journal.id as JournalId);
      expect(updated?.status).toBe(JournalStatus.PLANNED);
    });

    it('reverts using midnight when metadata has no original planned date', async () => {
      const postedAt = Date.UTC(2024, 8, 20, 18, 0, 0);
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'Posted direct',
          journalDate: postedAt,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId,
              amount: 15,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId,
              amount: 15,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        workplaceId,
      );

      await database.write(async () => {
        await journalMetadataRepository.patch(
          workplaceId,
          journal.id as JournalId,
          { note: 'no planned date here' },
          'test',
        );
      });

      await ledgerWriteService.revertToPlanned(journal.id as JournalId, workplaceId);
      await rebuildQueueService.flush();

      const updated = await journalQueryRepository.find(workplaceId, journal.id as JournalId);
      expect(updated?.status).toBe(JournalStatus.PLANNED);
      const midnight = new Date(postedAt);
      midnight.setHours(0, 0, 0, 0);
      expect(updated?.journalDate).toBe(midnight.getTime());
    });

    it('reverts using midnight when metadata JSON is invalid', async () => {
      const postedAt = Date.UTC(2024, 9, 5, 9, 0, 0);
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'Bad meta',
          journalDate: postedAt,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId,
              amount: 12,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId,
              amount: 12,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        workplaceId,
      );

      await database.write(async () => {
        const meta = await journalMetadataRepository.findByJournalId(
          journal.id as JournalId,
          workplaceId,
        );
        if (meta) {
          await meta.update((record: JournalMetadata) => {
            record.metadataJson = '{not-json';
            record.updatedAt = new Date();
          });
        }
      });

      await ledgerWriteService.revertToPlanned(journal.id as JournalId, workplaceId);
      await rebuildQueueService.flush();

      const updated = await journalQueryRepository.find(workplaceId, journal.id as JournalId);
      expect(updated?.status).toBe(JournalStatus.PLANNED);
    });
  });

  describe('recoverJournal', () => {
    it('clears soft-delete and makes journal visible again', async () => {
      const journal = await createPlannedJournal(Date.now());
      const journalId = journal.id as JournalId;

      await ledgerWriteService.deleteJournal(journalId, workplaceId);
      expect(await journalQueryRepository.find(workplaceId, journalId)).toBeNull();

      const deleted = await journalQueryRepository.findWithDeleted(workplaceId, journalId);
      expect(deleted?.deletedAt).toBeDefined();

      await ledgerWriteService.recoverJournal(journalId, workplaceId);
      await rebuildQueueService.flush();

      const restored = await journalQueryRepository.find(workplaceId, journalId);
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
