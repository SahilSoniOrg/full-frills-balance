import { database } from '@/src/data/database/Database';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import {
  AccountId,
  AccountType,
  JournalDisplayType,
  JournalId,
  TransactionType,
  WorkplaceId,
} from '@/src/types/domain';

const WORKPLACE_ONE = 'wp-journal-owner-one' as WorkplaceId;
const WORKPLACE_TWO = 'wp-journal-owner-two' as WorkplaceId;

describe('journal model-instance writer workplace ownership', () => {
  let workplaceOneJournal: Journal;
  let workplaceTwoJournal: Journal;
  let workplaceOneTransaction: Transaction;
  let workplaceTwoTransaction: Transaction;
  let workplaceOneAccountId: AccountId;
  let workplaceOneReplacementAccountId: AccountId;

  beforeEach(async () => {
    jest.restoreAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    const workplaceOneAccount = await accountRepository.create({
      workplaceId: WORKPLACE_ONE,
      name: 'Workplace One Account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const workplaceOneReplacementAccount = await accountRepository.create({
      workplaceId: WORKPLACE_ONE,
      name: 'Workplace One Replacement',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
    });
    const workplaceTwoAccount = await accountRepository.create({
      workplaceId: WORKPLACE_TWO,
      name: 'Workplace Two Account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    workplaceOneAccountId = workplaceOneAccount.id;
    workplaceOneReplacementAccountId = workplaceOneReplacementAccount.id;

    workplaceOneJournal = await journalWriteRepository.createJournalWithTransactions(
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
        ],
      },
      WORKPLACE_ONE,
    );
    workplaceTwoJournal = await journalWriteRepository.createJournalWithTransactions(
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

    [workplaceOneTransaction] = await transactionRepository.findByJournal(
      WORKPLACE_ONE,
      workplaceOneJournal.id,
    );
    [workplaceTwoTransaction] = await transactionRepository.findByJournal(
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

  it('rejects a foreign journal before opening the reversal writer', async () => {
    await expectRejectedBeforeWrite(() =>
      journalWriteRepository.persistReversal({
        workplaceId: WORKPLACE_ONE,
        originalJournal: workplaceTwoJournal,
        reversingJournalId: workplaceOneJournal.id as JournalId,
        reversalOps: [],
      }),
    );
  });

  it('rejects foreign reversal source models before opening the writer', async () => {
    await expectRejectedBeforeWrite(() =>
      journalWriteRepository.replaceJournalWithReversal({
        originalJournal: workplaceOneJournal,
        originalTransactions: [workplaceOneTransaction, workplaceTwoTransaction],
        replacementData: {
          journalDate: 3_000,
          currencyCode: 'USD',
          transactions: [],
        },
        workplaceId: WORKPLACE_ONE,
      }),
    );
  });

  it('rejects mixed-workplace journals before opening the bulk-rename writer', async () => {
    await expectRejectedBeforeWrite(() =>
      journalWriteRepository.bulkUpdateDescriptions(
        WORKPLACE_ONE,
        [workplaceOneJournal, workplaceTwoJournal],
        {
          [workplaceOneJournal.id as JournalId]: 'Safe rename',
          [workplaceTwoJournal.id as JournalId]: 'Foreign rename',
        },
      ),
    );
  });

  it('rejects a foreign transaction before opening the account-reassignment writer', async () => {
    await expectRejectedBeforeWrite(() =>
      journalWriteRepository.bulkReassignTransactionAccounts({
        workplaceId: WORKPLACE_ONE,
        transactions: [workplaceOneTransaction, workplaceTwoTransaction],
        newAccountId: workplaceOneReplacementAccountId,
        journals: [workplaceOneJournal],
        displayTypeByJournalId: new Map(),
      }),
    );
  });

  it('rejects a foreign journal before opening the account-reassignment undo writer', async () => {
    await expectRejectedBeforeWrite(() =>
      journalWriteRepository.bulkReassignTransactionAccountsToOriginals({
        workplaceId: WORKPLACE_ONE,
        transactions: [workplaceOneTransaction],
        originalAccountIdByTxId: {
          [workplaceOneTransaction.id]: workplaceOneAccountId,
        },
        journals: [workplaceOneJournal, workplaceTwoJournal],
        displayTypeByJournalId: new Map(),
      }),
    );
  });

  it('preserves valid status, rename, and reassignment writes for owned models', async () => {
    await journalPlannedQueries.batchUpdateStatus(
      WORKPLACE_ONE,
      [workplaceOneJournal],
      JournalStatus.SKIPPED,
    );
    await journalWriteRepository.bulkUpdateDescriptions(WORKPLACE_ONE, [workplaceOneJournal], {
      [workplaceOneJournal.id as JournalId]: 'Owned rename',
    });
    await journalWriteRepository.bulkReassignTransactionAccounts({
      workplaceId: WORKPLACE_ONE,
      transactions: [workplaceOneTransaction],
      newAccountId: workplaceOneReplacementAccountId,
      journals: [workplaceOneJournal],
      displayTypeByJournalId: new Map([[workplaceOneJournal.id, JournalDisplayType.EXPENSE]]),
    });

    const reloadedJournal = await database.collections
      .get<Journal>('journals')
      .find(workplaceOneJournal.id);
    const reloadedTransaction = await database.collections
      .get<Transaction>('transactions')
      .find(workplaceOneTransaction.id);

    expect(reloadedJournal).toMatchObject({
      workplaceId: WORKPLACE_ONE,
      status: JournalStatus.SKIPPED,
      description: 'Owned rename',
      displayType: JournalDisplayType.EXPENSE,
    });
    expect(reloadedTransaction).toMatchObject({
      workplaceId: WORKPLACE_ONE,
      accountId: workplaceOneReplacementAccountId,
    });
  });
});
