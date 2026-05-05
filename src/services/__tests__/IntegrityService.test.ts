import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { IntegrityService } from '@/src/services/integrity-service';
import { Q } from '@nozbe/watermelondb';
import { WorkplaceId } from '@/src/types/domain';

describe('IntegrityService', () => {
  let service: IntegrityService;
  let cashAccountId: string;
  let equityAccountId: string;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    service = new IntegrityService();

    const cash = await accountRepository.create({
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    const equity = await accountRepository.create({
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    cashAccountId = cash.id;
    equityAccountId = equity.id;
  });

  describe('computeBalanceFromTransactions', () => {
    it('should compute correct debit/credit balanced sum', async () => {
      await journalRepository.createJournalWithTransactions(
        {
          description: 'In',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            { accountId: cashAccountId, amount: 1000, transactionType: TransactionType.DEBIT },
            { accountId: equityAccountId, amount: 1000, transactionType: TransactionType.CREDIT },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      await journalRepository.createJournalWithTransactions(
        {
          description: 'Out',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            { accountId: cashAccountId, amount: 300, transactionType: TransactionType.CREDIT },
            { accountId: equityAccountId, amount: 300, transactionType: TransactionType.DEBIT },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const balance = await service.computeBalanceFromTransactions(
        cashAccountId,
        'wp-1' as WorkplaceId,
      );
      expect(balance).toBe(700);
    });
  });

  describe('verifyAccountBalance', () => {
    it('should detect when cached running balance is corrupted', async () => {
      await journalRepository.createJournalWithTransactions(
        {
          description: 'Deposit',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            { accountId: cashAccountId, amount: 500, transactionType: TransactionType.DEBIT },
            { accountId: equityAccountId, amount: 500, transactionType: TransactionType.CREDIT },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      // Corrupt it
      const transactions = await database.collections
        .get<Transaction>('transactions')
        .query()
        .fetch();
      await database.write(async () => {
        await transactions[0].update(t => {
          t.runningBalance = 9999;
        });
      });

      const result = await service.verifyAccountBalance(cashAccountId, 'wp-1' as WorkplaceId);
      expect(result.matches).toBe(false);
      expect(result.computedBalance).toBe(500);
    });
  });

  describe('repairAccountBalance', () => {
    it('should fix running balance discrepancies', async () => {
      await journalRepository.createJournalWithTransactions(
        {
          description: 'Deposit',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            { accountId: cashAccountId, amount: 500, transactionType: TransactionType.DEBIT },
            { accountId: equityAccountId, amount: 500, transactionType: TransactionType.CREDIT },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      // Corrupt it
      const transactions = await database.collections
        .get<Transaction>('transactions')
        .query()
        .fetch();
      await database.write(async () => {
        await transactions[0].update(t => {
          t.runningBalance = 9999;
        });
      });

      await service.repairAccountBalance('wp-1' as WorkplaceId, cashAccountId);

      const result = await service.verifyAccountBalance(cashAccountId, 'wp-1' as WorkplaceId);
      expect(result.matches).toBe(true);
      expect(result.computedBalance).toBe(500);
    });
  });

  describe('computeBalanceFromTransactions with snapshot boundaries', () => {
    it('should correctly compute balance when snapshot exists on a boundary with multiple transactions at same timestamp', async () => {
      const now = Date.now();

      // Create two transactions at the exact same timestamp
      // Note: We use manual created_at via update to ensure they match exactly
      await journalRepository.createJournalWithTransactions(
        {
          description: 'First',
          journalDate: now,
          currencyCode: 'USD',
          transactions: [
            { accountId: cashAccountId, amount: 100, transactionType: TransactionType.DEBIT },
          ],
        },
        'wp-1' as WorkplaceId,
      );
      await journalRepository.createJournalWithTransactions(
        {
          description: 'Second',
          journalDate: now,
          currencyCode: 'USD',
          transactions: [
            { accountId: cashAccountId, amount: 200, transactionType: TransactionType.DEBIT },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const allTxs = await database.collections
        .get<Transaction>('transactions')
        .query(Q.where('account_id', cashAccountId))
        .fetch();

      // Sort to identify first and second reliably
      const sorted = [...allTxs].sort((a, b) => a.id.localeCompare(b.id));
      const tx1 = sorted[0];
      const tx2 = sorted[1];

      // Manually align their created_at to be identical
      const sameTime = new Date();
      await database.write(async () => {
        await tx1.update(t => {
          t.createdAt = sameTime;
          t.runningBalance = 100;
          t.transactionDate = now;
        });
        await tx2.update(t => {
          t.createdAt = sameTime;
          t.runningBalance = 300;
          t.transactionDate = now;
        });
      });

      // Re-fetch to ensure we have updated state
      const uTx1 = await database.collections.get<Transaction>('transactions').find(tx1.id);

      // Create a snapshot for the FIRST transaction
      await balanceSnapshotRepository.create('wp-1' as WorkplaceId, {
        accountId: cashAccountId,
        transactionId: uTx1!.id,
        transactionDate: uTx1!.transactionDate,
        absoluteBalance: 100,
        transactionCount: 1,
      });

      // The computed balance should be 300 (100 from snapshot + 200 from tx2)
      const balance = await service.computeBalanceFromTransactions(
        cashAccountId,
        'wp-1' as WorkplaceId,
      );
      expect(balance).toBe(300);
    });
  });
});
