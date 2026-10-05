import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { bulkRenameJournals } from '@/src/services/journal/bulk';
import { JournalStatus, TransactionType } from '@/src/types/enums';
import type { JournalId } from '@/src/types/ids';
import {
  JOURNAL_OWNERSHIP_WORKPLACE_ONE,
  JOURNAL_OWNERSHIP_WORKPLACE_TWO,
  seedWorkplaceJournalOwnershipFixtures,
  type WorkplaceJournalOwnershipFixtures,
} from './journalPersistenceTest.helpers';

describe('journal write workplace ownership', () => {
  let fixtures: WorkplaceJournalOwnershipFixtures;

  beforeEach(async () => {
    jest.restoreAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    fixtures = await seedWorkplaceJournalOwnershipFixtures();
  });

  it('rejects planned-status updates for a journal owned by another workplace', async () => {
    const { workplaceTwoJournal } = fixtures;
    await expect(
      runAccountingWriteSession(session =>
        journalPersistenceRepository.setNonPostedStatusesInSession(
          session,
          JOURNAL_OWNERSHIP_WORKPLACE_ONE,
          [{ journalId: workplaceTwoJournal.id, status: JournalStatus.SKIPPED }],
        ),
      ),
    ).rejects.toThrow(`Journal ${workplaceTwoJournal.id} not found`);

    const reloadedJournal = await database.collections
      .get<Journal>('journals')
      .find(workplaceTwoJournal.id);
    expect(reloadedJournal.status).toBe(JournalStatus.POSTED);
  });

  it('scopes ID-based journal, rename, and account-reassignment writes to the workplace', async () => {
    const {
      workplaceTwoJournal,
      workplaceTwoTransaction,
      workplaceOneAccountId,
      workplaceOneReplacementAccountId,
    } = fixtures;

    await expect(
      journalPersistenceService.put(
        {
          journalId: workplaceTwoJournal.id as JournalId,
          journalDate: 2_500,
          description: 'Foreign update',
          currencyCode: 'USD',
          transactions: [
            {
              accountId: workplaceOneAccountId,
              amount: 10,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: workplaceOneReplacementAccountId,
              amount: 10,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        JOURNAL_OWNERSHIP_WORKPLACE_ONE,
      ),
    ).rejects.toThrow('Journal not found');

    await expect(
      journalPersistenceRepository.reassignAccounts(
        {
          accountIdByTransactionId: new Map([
            [workplaceTwoTransaction.id, workplaceOneReplacementAccountId],
          ]),
        },
        JOURNAL_OWNERSHIP_WORKPLACE_ONE,
      ),
    ).rejects.toThrow('Some transactions could not be found for account reassignment.');

    const renameResult = await bulkRenameJournals(JOURNAL_OWNERSHIP_WORKPLACE_ONE, {
      [workplaceTwoJournal.id]: 'Foreign rename',
    });
    expect(renameResult).toEqual({ renamedCount: 0, inverseRenames: {} });

    await journalPersistenceService.delete(workplaceTwoJournal.id, JOURNAL_OWNERSHIP_WORKPLACE_ONE);

    const reloadedJournal = await database.collections
      .get<Journal>('journals')
      .find(workplaceTwoJournal.id);
    const reloadedTransaction = await database.collections
      .get<Transaction>('transactions')
      .find(workplaceTwoTransaction.id);
    expect(reloadedJournal.workplaceId).toBe(JOURNAL_OWNERSHIP_WORKPLACE_TWO);
    expect(reloadedJournal.description).toBe('Workplace Two Journal');
    expect(reloadedJournal.deletedAt).toBeFalsy();
    expect(reloadedTransaction.workplaceId).toBe(JOURNAL_OWNERSHIP_WORKPLACE_TWO);
    expect(reloadedTransaction.accountId).toBe(workplaceTwoTransaction.accountId);
  });

  it('preserves valid planned-status and journal renames for owned rows', async () => {
    const { workplaceOneJournal } = fixtures;
    await runAccountingWriteSession(session =>
      journalPersistenceRepository.setNonPostedStatusesInSession(
        session,
        JOURNAL_OWNERSHIP_WORKPLACE_ONE,
        [
          {
            journalId: workplaceOneJournal.id,
            status: JournalStatus.SKIPPED,
            expectedStatus: JournalStatus.PLANNED,
          },
        ],
      ),
    );
    const rename = await bulkRenameJournals(JOURNAL_OWNERSHIP_WORKPLACE_ONE, {
      [workplaceOneJournal.id]: 'Owned rename',
    });

    const reloadedJournal = await database.collections
      .get<Journal>('journals')
      .find(workplaceOneJournal.id);
    expect(rename).toEqual({
      renamedCount: 1,
      inverseRenames: { [workplaceOneJournal.id]: 'Workplace One Journal' },
    });
    expect(reloadedJournal).toMatchObject({
      workplaceId: JOURNAL_OWNERSHIP_WORKPLACE_ONE,
      status: JournalStatus.SKIPPED,
      description: 'Owned rename',
    });
  });
});
