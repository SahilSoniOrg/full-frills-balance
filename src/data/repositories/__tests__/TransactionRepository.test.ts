import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';

import { rebuildQueueService } from '@/src/services/RebuildQueueService';

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
      workplaceId: 'wp-1',
    });
    accountId = account.id;

    // Create Equity account for balancing
    const equity = await accountRepository.create({
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
      workplaceId: 'wp-1',
    });
    equityAccountId = equity.id;
  });

  afterEach(() => {
    rebuildQueueService.stop();
  });

  describe('findByJournal', () => {
    it('should return transactions for a specific journal', async () => {
      const journal = await journalRepository.createJournalWithTransactions(
        {
          description: 'Test Journal',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            { accountId, amount: 100, transactionType: TransactionType.DEBIT },
            { accountId: equityAccountId, amount: 100, transactionType: TransactionType.CREDIT },
          ],
        },
        'wp-1',
      );

      const transactions = await transactionRepository.findByJournal(journal.id, 'wp-1');
      expect(transactions).toHaveLength(2);
      expect(transactions[0].journalId).toBe(journal.id);
    });
  });

  describe('rebuildRunningBalances', () => {
    it('should correctly calculate running balances', async () => {
      // Create a sequence of journals
      await journalRepository.createJournalWithTransactions(
        {
          description: 'T1',
          journalDate: 1000,
          currencyCode: 'USD',
          transactions: [
            { accountId, amount: 100, transactionType: TransactionType.DEBIT },
            { accountId: equityAccountId, amount: 100, transactionType: TransactionType.CREDIT },
          ],
        },
        'wp-1',
      ); // +100

      await journalRepository.createJournalWithTransactions(
        {
          description: 'T2',
          journalDate: 2000,
          currencyCode: 'USD',
          transactions: [
            { accountId, amount: 50, transactionType: TransactionType.CREDIT },
            { accountId: equityAccountId, amount: 50, transactionType: TransactionType.DEBIT },
          ],
        },
        'wp-1',
      ); // -50

      await accountingRebuildService.rebuildAccountBalances('wp-1', accountId, 0);

      const txs = await transactionRepository.findByAccount(accountId, 'wp-1');
      // Sorted by date desc: T2 (2000), T1 (1000)
      expect(txs).toHaveLength(2);
      expect(txs[0].runningBalance).toBe(50); // T2: 100 - 50 = 50
      expect(txs[1].runningBalance).toBe(100); // T1: 0 + 100 = 100
    });

    it('should handle inserted historic transactions', async () => {
      // T1
      await journalRepository.createJournalWithTransactions(
        {
          description: 'T1',
          journalDate: 1000,
          currencyCode: 'USD',
          transactions: [
            { accountId, amount: 100, transactionType: TransactionType.DEBIT },
            { accountId: equityAccountId, amount: 100, transactionType: TransactionType.CREDIT },
          ],
        },
        'wp-1',
      );

      // T3
      await journalRepository.createJournalWithTransactions(
        {
          description: 'T3',
          journalDate: 3000,
          currencyCode: 'USD',
          transactions: [
            { accountId, amount: 200, transactionType: TransactionType.DEBIT },
            { accountId: equityAccountId, amount: 200, transactionType: TransactionType.CREDIT },
          ],
        },
        'wp-1',
      );

      // T2 (Inserted)
      await journalRepository.createJournalWithTransactions(
        {
          description: 'T2',
          journalDate: 2000,
          currencyCode: 'USD',
          transactions: [
            { accountId, amount: 50, transactionType: TransactionType.CREDIT },
            { accountId: equityAccountId, amount: 50, transactionType: TransactionType.DEBIT },
          ],
        },
        'wp-1',
      );

      await accountingRebuildService.rebuildAccountBalances('wp-1', accountId);

      const txs = await transactionRepository.findByAccount(accountId, 'wp-1');
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
      await journalRepository.createJournalWithTransactions(
        {
          description: 'In Range',
          journalDate: 2000,
          currencyCode: 'USD',
          transactions: [
            { accountId, amount: 100, transactionType: TransactionType.DEBIT },
            { accountId: equityAccountId, amount: 100, transactionType: TransactionType.CREDIT },
          ],
        },
        'wp-1',
      );

      await journalRepository.createJournalWithTransactions(
        {
          description: 'Out of Range',
          journalDate: 5000,
          currencyCode: 'USD',
          transactions: [
            { accountId, amount: 100, transactionType: TransactionType.DEBIT },
            { accountId: equityAccountId, amount: 100, transactionType: TransactionType.CREDIT },
          ],
        },
        'wp-1',
      );

      const txs = await transactionRepository.findByAccountsAndDateRange(
        'wp-1',
        [accountId],
        1000,
        3000,
      );

      expect(txs).toHaveLength(1);
      expect(txs[0].transactionDate).toBe(2000);
    });
  });
});
