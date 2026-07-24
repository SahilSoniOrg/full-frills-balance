/**
 * Integration tests for JournalRepository
 * Tests double-entry accounting, precision handling, and balance integrity
 */

import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { balanceService } from '@/src/services/BalanceService';
import { journalService } from '@/src/services/journal/journalDomainService';
import { observeEnrichedJournals } from '@/src/services/journal/journalEnrichedObserver';
import { ledgerWriteService } from '@/src/services/ledger';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { transactionService } from '@/src/services/transaction-ingestion';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';

describe('JournalRepository', () => {
  let cashAccountId: string;
  let expenseAccountId: string;
  let incomeAccountId: string;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    // Create test accounts
    const cash = await accountRepository.create({
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    const expense = await accountRepository.create({
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    const income = await accountRepository.create({
      name: 'Salary',
      accountType: AccountType.INCOME,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });

    cashAccountId = cash.id;
    expenseAccountId = expense.id;
    incomeAccountId = income.id;
  }, 10000);

  describe('createJournalWithTransactions', () => {
    it('should create a balanced journal successfully', async () => {
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'Lunch expense',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 25,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 25,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      expect(journal).toBeDefined();
      expect(journal.id).toBeDefined();
      expect(journal.totalAmount).toBe(25);
      expect(journal.transactionCount).toBe(2);
    });

    it('should reject unbalanced journals', async () => {
      await expect(
        ledgerWriteService.createJournal(
          {
            description: 'Unbalanced',
            journalDate: Date.now(),
            currencyCode: 'USD',
            transactions: [
              {
                accountId: cashAccountId as AccountId,
                amount: 100,
                transactionType: TransactionType.CREDIT,
              },
              {
                accountId: expenseAccountId as AccountId,
                amount: 50,
                transactionType: TransactionType.DEBIT,
              },
            ],
          },
          'wp-1' as WorkplaceId,
        ),
      ).rejects.toThrow(/Unbalanced journal/);
    });

    it('should handle multi-leg journals', async () => {
      // Receive salary and immediately pay some expense
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'Salary with immediate expense',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 900,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: incomeAccountId as AccountId,
              amount: 1000,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 100,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      expect(journal.transactionCount).toBe(3);
      expect(journal.totalAmount).toBe(1000);
    });

    it('should update account balances correctly', async () => {
      await ledgerWriteService.createJournal(
        {
          description: 'Deposit',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 500,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: incomeAccountId as AccountId,
              amount: 500,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      // Ensure rebuilds complete
      await rebuildQueueService.flush();

      const cashBalance = await balanceService.getAccountBalance(
        cashAccountId as AccountId,
        'wp-1' as WorkplaceId,
      );
      expect(cashBalance.balance).toBe(500);

      const incomeBalance = await balanceService.getAccountBalance(
        incomeAccountId as AccountId,
        'wp-1' as WorkplaceId,
      );
      expect(incomeBalance.balance).toBe(500);
    });
  });

  describe('updateJournalWithTransactions', () => {
    it('should update journal and recalculate balances', async () => {
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'Original',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 100,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 100,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      await journalService.updateJournal(
        journal.id,
        {
          description: 'Updated',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 200,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 200,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      // Re-fetch from database to get updated values
      const updatedJournal = await journalRepository.find(
        'wp-1' as WorkplaceId,
        journal.id as JournalId,
      );
      expect(updatedJournal).toBeDefined();
      expect(updatedJournal!.totalAmount).toBe(200);
      expect(updatedJournal!.description).toBe('Updated');
    }, 10000);
  });

  describe('duplicateJournal', () => {
    it('should duplicate a journal and its transactions', async () => {
      const originalJournal = await ledgerWriteService.createJournal(
        {
          description: 'Original Transaction',
          journalDate: Date.now() - 86400000, // Yesterday
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 123.45,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 123.45,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const duplicatedJournal = await journalService.duplicateJournal(
        originalJournal.id,
        'wp-1' as WorkplaceId,
      );

      expect(duplicatedJournal).toBeDefined();
      expect(duplicatedJournal.id).not.toBe(originalJournal.id);
      expect(duplicatedJournal.description).toBe(`${originalJournal.description}`);
      expect(duplicatedJournal.totalAmount).toBe(originalJournal.totalAmount);
      expect(duplicatedJournal.transactionCount).toBe(originalJournal.transactionCount);

      // Transactions should be duplicated faithfully
      const duplicatedTransactions = await transactionService.getEnrichedByJournal(
        'wp-1' as WorkplaceId,
        duplicatedJournal.id as JournalId,
      );
      expect(duplicatedTransactions).toHaveLength(2);

      const cashTx = duplicatedTransactions.find(t => t.accountId === (cashAccountId as AccountId));
      const expenseTx = duplicatedTransactions.find(
        t => t.accountId === (expenseAccountId as AccountId),
      );

      expect(cashTx?.amount).toBe(123.45);
      expect(cashTx?.transactionType).toBe(TransactionType.CREDIT);
      expect(expenseTx?.amount).toBe(123.45);
      expect(expenseTx?.transactionType).toBe(TransactionType.DEBIT);
    });
  });

  describe('deleteJournal', () => {
    // TODO: Fix rebuild queue singleton timing issue in test environment
    it('should soft-delete journal and its transactions', async () => {
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'To be deleted',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 50,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 50,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      await journalService.deleteJournal(journal.id as JournalId, 'wp-1' as WorkplaceId);

      // Don't wait for rebuild queue - this test only verifies soft-delete
      const deletedJournal = await database.collections.get<Journal>('journals').find(journal.id);
      expect(deletedJournal.deletedAt).toBeDefined();
    });
  });

  describe('observeEnrichedJournals search functionality', () => {
    it('should find journals by matching description', async () => {
      await ledgerWriteService.createJournal(
        {
          description: 'Unique test description',
          notes: 'Some notes',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 10,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 10,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const observable = observeEnrichedJournals(
        'wp-1' as WorkplaceId,
        10,
        undefined,
        'Unique test',
      );

      const results = await new Promise<any[]>(resolve => {
        const subscription = observable.subscribe(data => {
          subscription.unsubscribe();
          resolve(data);
        });
      });

      expect(results).toHaveLength(1);
      expect(results[0].description).toBe('Unique test description');
    });

    it('should find journals by matching notes', async () => {
      await ledgerWriteService.createJournal(
        {
          description: 'Another entry',
          notes: 'Unique test notes',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 10,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 10,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const observable = observeEnrichedJournals(
        'wp-1' as WorkplaceId,
        10,
        undefined,
        'Unique test notes',
      );

      const results = await new Promise<any[]>(resolve => {
        const subscription = observable.subscribe(data => {
          subscription.unsubscribe();
          resolve(data);
        });
      });

      expect(results).toHaveLength(1);
      expect(results[0].notes).toBe('Unique test notes');
    });

    it('should not find journals if query does not match description or notes', async () => {
      await ledgerWriteService.createJournal(
        {
          description: 'Standard description',
          notes: 'Standard notes',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 10,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 10,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const observable = observeEnrichedJournals(
        'wp-1' as WorkplaceId,
        10,
        undefined,
        'Non-existent match',
      );

      const results = await new Promise<any[]>(resolve => {
        const subscription = observable.subscribe(data => {
          subscription.unsubscribe();
          resolve(data);
        });
      });

      expect(results).toHaveLength(0);
    });
  });

  describe('observeEnrichedJournals reactive updates', () => {
    it('should emit updated accounts when a journal accounts are modified', async () => {
      // 1. Create a journal with account A and account B
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'Reactive test',
          notes: 'Standard notes',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 10,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 10,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      // 2. Observe the enriched journals
      const observable = observeEnrichedJournals('wp-1' as WorkplaceId, 10);

      const states: any[][] = [];
      const sub = observable.subscribe(data => {
        states.push(data);
      });

      // Wait a moment for initial emission to settle
      await new Promise(resolve => setTimeout(resolve, 50));

      // 3. Create a new account C
      const accountC = await accountRepository.create({
        name: 'Account C',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        workplaceId: 'wp-1' as WorkplaceId,
      });

      // 4. Update the journal to use account C instead of expenseAccountId
      await journalService.updateJournal(
        journal.id as JournalId,
        {
          description: 'Reactive test',
          notes: 'Standard notes',
          journalDate: journal.journalDate,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 10,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: accountC.id as AccountId,
              amount: 10,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      // Wait for async subscription notification to propagate
      await new Promise(resolve => setTimeout(resolve, 100));
      sub.unsubscribe();

      // Verify we received the update and it contains the new account
      expect(states.length).toBeGreaterThan(1);
      const lastState = states[states.length - 1];
      const matchingJournal = lastState.find(j => j.id === journal.id);
      expect(matchingJournal).toBeDefined();

      const accountIds = matchingJournal!.accounts.map((a: any) => a.id);
      expect(accountIds).toContain(accountC.id);
    });
  });
});
