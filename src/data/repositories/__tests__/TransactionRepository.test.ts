import { database } from '@/src/data/database/Database';
import { AccountType, TransactionType, JournalStatus } from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';

import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';

import { rebuildQueueService } from '@/src/services/RebuildQueueService';

describe('TransactionRepository', () => {
  let accountId: string;
  let equityAccountId: string;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    const account = await accountWriteRepository.create({
      name: 'Test Account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    accountId = account.id;

    // Create Equity account for balancing
    const equity = await accountWriteRepository.create({
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    equityAccountId = equity.id;
  });

  afterEach(() => {
    rebuildQueueService.stop();
  });

  describe('findByJournal', () => {
    it('should return transactions for a specific journal', async () => {
      const journal = await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Test Journal',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 100,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 100,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const transactions = await transactionQueryRepository.findByJournal(
        'wp-1' as WorkplaceId,
        journal.id as JournalId,
      );
      expect(transactions).toHaveLength(2);
      expect(transactions[0].journalId).toBe(journal.id);
    });
  });

  describe('findEarliest', () => {
    it('returns the earliest active journal transaction only', async () => {
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Planned earlier',
          journalDate: 1_000,
          currencyCode: 'USD',
          status: JournalStatus.PLANNED,
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 10,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );
      const posted = await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Posted later',
          journalDate: 2_000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 20,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const earliest = await transactionQueryRepository.findEarliest('wp-1' as WorkplaceId);
      expect(earliest?.journalId).toBe(posted.id);
      expect(earliest?.transactionDate).toBe(2_000);
    });
  });

  describe('rebuildRunningBalances', () => {
    it('should correctly calculate running balances', async () => {
      // Create a sequence of journals
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'T1',
          journalDate: 1000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 100,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 100,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      ); // +100

      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'T2',
          journalDate: 2000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 50,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 50,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      ); // -50

      await accountingRebuildService.rebuildAccountBalances(
        'wp-1' as WorkplaceId,
        accountId as AccountId,
        0,
      );

      const txs = await transactionQueryRepository.findByAccount(
        'wp-1' as WorkplaceId,
        accountId as AccountId,
      );
      // Sorted by date desc: T2 (2000), T1 (1000)
      expect(txs).toHaveLength(2);
      expect(txs[0].runningBalance).toBe(50); // T2: 100 - 50 = 50
      expect(txs[1].runningBalance).toBe(100); // T1: 0 + 100 = 100
    });

    it('should handle inserted historic transactions', async () => {
      // T1
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'T1',
          journalDate: 1000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 100,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 100,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      // T3
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'T3',
          journalDate: 3000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 200,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 200,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      // T2 (Inserted)
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'T2',
          journalDate: 2000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 50,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 50,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      await accountingRebuildService.rebuildAccountBalances(
        'wp-1' as WorkplaceId,
        accountId as AccountId,
      );

      const txs = await transactionQueryRepository.findByAccount(
        'wp-1' as WorkplaceId,
        accountId as AccountId,
      );
      // T3, T2, T1
      expect(txs[0].transactionDate).toBe(3000); // T3
      expect(txs[0].runningBalance).toBe(250); // 100 - 50 + 200 = 250

      expect(txs[1].transactionDate).toBe(2000); // T2
      expect(txs[1].runningBalance).toBe(50); // 100 - 50 = 50

      expect(txs[2].transactionDate).toBe(1000); // T1
      expect(txs[2].runningBalance).toBe(100); // 100
    });
  });

  describe('findByAccountsAndDateRange', () => {
    it('should filter by date range', async () => {
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'In Range',
          journalDate: 2000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 100,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 100,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Out of Range',
          journalDate: 5000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 100,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 100,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const txs = await transactionQueryRepository.findByAccountsAndDateRange(
        'wp-1' as WorkplaceId,
        [accountId],
        1000,
        3000,
      );

      expect(txs).toHaveLength(1);
      expect(txs[0].transactionDate).toBe(2000);
    });

    it('keeps every account chunk scoped to the requested workplace', async () => {
      const workplaceOne = 'wp-1' as WorkplaceId;
      const workplaceTwo = 'wp-2' as WorkplaceId;
      const secondLocalAccount = await accountWriteRepository.create({
        name: 'Second local account',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId: workplaceOne,
      });
      const foreignAccount = await accountWriteRepository.create({
        name: 'Foreign account',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId: workplaceTwo,
      });
      const foreignEquity = await accountWriteRepository.create({
        name: 'Foreign equity',
        accountType: AccountType.EQUITY,
        currencyCode: 'USD',
        workplaceId: workplaceTwo,
      });

      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'First chunk local transaction',
          journalDate: 2_000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 20,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 20,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        workplaceOne,
      );
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Second chunk local transaction',
          journalDate: 3_000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: secondLocalAccount.id,
              amount: 30,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 30,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        workplaceOne,
      );
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Foreign transaction',
          journalDate: 2_500,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: foreignAccount.id,
              amount: 25,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: foreignEquity.id,
              amount: 25,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        workplaceTwo,
      );
      const deletedJournal = await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Deleted local transaction',
          journalDate: 3_500,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: secondLocalAccount.id,
              amount: 35,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 35,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        workplaceOne,
      );
      await journalWriteRepository.softDeleteJournal(workplaceOne, deletedJournal.id as JournalId);
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Out of range local transaction',
          journalDate: 5_000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 50,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 50,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        workplaceOne,
      );

      const accountIds = [
        accountId,
        ...Array.from({ length: 99 }, (_, index) => `unused-account-${index}`),
        secondLocalAccount.id,
        foreignAccount.id,
      ];
      const transactions = await transactionQueryRepository.findByAccountsAndDateRange(
        workplaceOne,
        accountIds,
        1_000,
        4_000,
      );

      expect(accountIds).toHaveLength(102);
      expect(transactions.map(transaction => transaction.transactionDate)).toEqual([3_000, 2_000]);
      expect(transactions.every(transaction => transaction.workplaceId === workplaceOne)).toBe(
        true,
      );
    });

    it('findForAccountUpToDate excludes transactions linked to foreign journals or belonging to foreign workplaces', async () => {
      const workplaceOne = 'wp-1' as WorkplaceId;
      const workplaceTwo = 'wp-2' as WorkplaceId;

      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'wp-1 tx',
          journalDate: 1_000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 100,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 100,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        workplaceOne,
      );

      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'wp-2 tx',
          journalDate: 2_000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 200,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 200,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        workplaceTwo,
      );

      const txs = await transactionQueryRepository.findForAccountUpToDate(
        workplaceOne,
        accountId as AccountId,
        5_000,
      );

      expect(txs).toHaveLength(1);
      expect(txs[0].amount).toBe(100);
      expect(txs[0].workplaceId).toBe(workplaceOne);
    });
  });
});
