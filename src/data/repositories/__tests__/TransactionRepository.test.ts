import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';

import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';

describe('TransactionRepository', () => {
  let accountId: string;
  let equityAccountId: string;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    const account = await accountRepository.create({
      name: 'Test Account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    accountId = account.id;

    // Create Equity account for balancing
    const equity = await accountRepository.create({
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

      const transactions = await transactionRepository.findByJournal(
        'wp-1' as WorkplaceId,
        journal.id as JournalId,
      );
      expect(transactions).toHaveLength(2);
      expect(transactions[0].journalId).toBe(journal.id);
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

      const txs = await transactionRepository.findByAccount(
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

      const txs = await transactionRepository.findByAccount(
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

      const txs = await transactionRepository.findByAccountsAndDateRange(
        'wp-1' as WorkplaceId,
        [accountId],
        1000,
        3000,
      );

      expect(txs).toHaveLength(1);
      expect(txs[0].transactionDate).toBe(2000);
    });
  });
});
