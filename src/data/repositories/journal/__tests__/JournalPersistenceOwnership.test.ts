import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { bulkRenameJournals } from '@/src/services/journal/bulk';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';

const WORKPLACE_ONE = 'wp-journal-owner-one' as WorkplaceId;
const WORKPLACE_TWO = 'wp-journal-owner-two' as WorkplaceId;

describe('journal write workplace ownership', () => {
  let workplaceOneJournal: Journal;
  let workplaceTwoJournal: Journal;
  let workplaceTwoTransaction: Transaction;
  let workplaceOneAccountId: AccountId;
  let workplaceOneReplacementAccountId: AccountId;

  beforeEach(async () => {
    jest.restoreAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    const workplaceOneAccount = await accountWriteRepository.create({
      workplaceId: WORKPLACE_ONE,
      name: 'Workplace One Account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const workplaceOneReplacementAccount = await accountWriteRepository.create({
      workplaceId: WORKPLACE_ONE,
      name: 'Workplace One Replacement',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
    });
    const workplaceTwoAccount = await accountWriteRepository.create({
      workplaceId: WORKPLACE_TWO,
      name: 'Workplace Two Account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    workplaceOneAccountId = workplaceOneAccount.id;
    workplaceOneReplacementAccountId = workplaceOneReplacementAccount.id;

    workplaceOneJournal = await createJournalFixture(
      {
        journalDate: 1_000,
        description: 'Workplace One Journal',
        currencyCode: 'USD',
        transactions: [
          {
            accountId: workplaceOneAccount.id,
            amount: 10,
            transactionType: TransactionType.DEBIT,
          },
          {
            accountId: workplaceOneReplacementAccount.id,
            amount: 10,
            transactionType: TransactionType.CREDIT,
          },
        ],
      },
      WORKPLACE_ONE,
    );
    workplaceTwoJournal = await createJournalFixture(
      {
        journalDate: 2_000,
        description: 'Workplace Two Journal',
        currencyCode: 'USD',
        transactions: [
          {
            accountId: workplaceTwoAccount.id,
            amount: 20,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      WORKPLACE_TWO,
    );

    [workplaceTwoTransaction] = await transactionQueryRepository.findByJournal(
      WORKPLACE_TWO,
      workplaceTwoJournal.id,
    );
  });

  async function expectRejectedBeforeWrite(operation: () => Promise<unknown>): Promise<void> {
    const writeSpy = jest.spyOn(database, 'write');
    await expect(operation()).rejects.toThrow(/does not belong to workplace/);
    expect(writeSpy).not.toHaveBeenCalled();
  }

  it('rejects a foreign journal before preparing planned-status updates', () => {
    expect(() =>
      journalPlannedQueries.prepareStatusUpdates(
        WORKPLACE_ONE,
        [workplaceOneJournal, workplaceTwoJournal],
        JournalStatus.SKIPPED,
      ),
    ).toThrow(/does not belong to workplace/);
  });

  it('rejects a foreign journal before opening the planned-status writer', async () => {
    await expectRejectedBeforeWrite(() =>
      journalPlannedQueries.batchUpdateStatus(
        WORKPLACE_ONE,
        [workplaceTwoJournal],
        JournalStatus.SKIPPED,
      ),
    );
  });

  it('scopes ID-based journal, rename, and account-reassignment writes to the workplace', async () => {
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
        WORKPLACE_ONE,
      ),
    ).rejects.toThrow('Journal not found');

    await expect(
      journalPersistenceRepository.reassignAccounts(
        {
          accountIdByTransactionId: new Map([
            [workplaceTwoTransaction.id, workplaceOneReplacementAccountId],
          ]),
          displayTypeByJournalId: new Map(),
        },
        WORKPLACE_ONE,
      ),
    ).rejects.toThrow('Some transactions could not be found for account reassignment.');

    const renameResult = await bulkRenameJournals(WORKPLACE_ONE, {
      [workplaceTwoJournal.id]: 'Foreign rename',
    });
    expect(renameResult).toEqual({ renamedCount: 0, inverseRenames: {} });

    await journalPersistenceService.delete(workplaceTwoJournal.id, WORKPLACE_ONE);

    const reloadedJournal = await database.collections
      .get<Journal>('journals')
      .find(workplaceTwoJournal.id);
    const reloadedTransaction = await database.collections
      .get<Transaction>('transactions')
      .find(workplaceTwoTransaction.id);
    expect(reloadedJournal.workplaceId).toBe(WORKPLACE_TWO);
    expect(reloadedJournal.description).toBe('Workplace Two Journal');
    expect(reloadedJournal.deletedAt).toBeFalsy();
    expect(reloadedTransaction.workplaceId).toBe(WORKPLACE_TWO);
    expect(reloadedTransaction.accountId).toBe(workplaceTwoTransaction.accountId);
  });

  it('preserves valid planned-status and journal renames for owned rows', async () => {
    await journalPlannedQueries.batchUpdateStatus(
      WORKPLACE_ONE,
      [workplaceOneJournal],
      JournalStatus.SKIPPED,
    );
    const rename = await bulkRenameJournals(WORKPLACE_ONE, {
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
      workplaceId: WORKPLACE_ONE,
      status: JournalStatus.SKIPPED,
      description: 'Owned rename',
    });
  });
});
