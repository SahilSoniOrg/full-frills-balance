import {
  AccountType,
  TransactionType,
  AccountId,
  JournalId,
  WorkplaceId,
} from '@/src/types/domain';
/**
 * Integration tests for journal write/read modules (ledger + journal query repositories).
 * Tests double-entry accounting, precision handling, and balance integrity.
 */

import { database } from '@/src/data/database/Database';

import Journal from '@/src/data/models/Journal';

import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { balanceService } from '@/src/services/balance';
import { journalService } from '@/src/services/journal/journalDomainService';
import { observeEnrichedJournals } from '@/src/services/journal/journalTimelineReadModel';
import { ledgerWriteService } from '@/src/services/ledger';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { transactionService } from '@/src/services/transaction-ingestion';

describe('Journal ledger integration', () => {
  let cashAccountId: string;
  let expenseAccountId: string;
  let incomeAccountId: string;

  beforeEach(async () => {
    rebuildQueueService.stop();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    // Create test accounts
    const cash = await accountWriteRepository.create({
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    const expense = await accountWriteRepository.create({
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    const income = await accountWriteRepository.create({
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
      const updatedJournal = await journalQueryRepository.find(
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
      const accountC = await accountWriteRepository.create({
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
              accountId: accountC.id,
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

    it('should not list a journal on an account page after that account is removed from the journal', async () => {
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'Account filter test',
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

      const accountC = await accountWriteRepository.create({
        name: 'Account C',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        workplaceId: 'wp-1' as WorkplaceId,
      });

      const observeForExpenseAccount = () =>
        new Promise<any[]>(resolve => {
          const subscription = observeEnrichedJournals('wp-1' as WorkplaceId, 10, {
            accountIds: [expenseAccountId],
            startDate: 0,
            endDate: Number.MAX_SAFE_INTEGER,
          }).subscribe(data => {
            subscription.unsubscribe();
            resolve(data);
          });
        });

      const beforeUpdate = await observeForExpenseAccount();
      expect(beforeUpdate.some(j => j.id === journal.id)).toBe(true);

      await journalService.updateJournal(
        journal.id as JournalId,
        {
          description: 'Account filter test',
          journalDate: journal.journalDate,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 10,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: accountC.id,
              amount: 10,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const afterUpdate = await observeForExpenseAccount();
      expect(afterUpdate.some(j => j.id === journal.id)).toBe(false);
    });
  });

  describe('observeEnrichedJournals account filter', () => {
    async function observeForAccounts(accountIds: string[]) {
      return new Promise<any[]>(resolve => {
        const subscription = observeEnrichedJournals('wp-1' as WorkplaceId, 10, {
          accountIds,
          startDate: 0,
          endDate: Number.MAX_SAFE_INTEGER,
        }).subscribe(data => {
          subscription.unsubscribe();
          resolve(data);
        });
      });
    }

    async function createCashExpenseJournal(description: string, amount = 10) {
      return ledgerWriteService.createJournal(
        {
          description,
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );
    }

    it('lists a journal when the account has an active transaction leg', async () => {
      const journal = await createCashExpenseJournal('Active leg filter');

      const results = await observeForAccounts([expenseAccountId]);

      expect(results.some(j => j.id === journal.id)).toBe(true);
    });

    it('still lists the journal for the replacement account after a counterparty swap', async () => {
      const journal = await createCashExpenseJournal('Replacement account filter');
      const accountC = await accountWriteRepository.create({
        name: 'Account C',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        workplaceId: 'wp-1' as WorkplaceId,
      });

      await journalService.updateJournal(
        journal.id as JournalId,
        {
          description: 'Replacement account filter',
          journalDate: journal.journalDate,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 10,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: accountC.id,
              amount: 10,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const results = await observeForAccounts([accountC.id]);

      expect(results.some(j => j.id === journal.id)).toBe(true);
    });

    it('still lists the journal for an unchanged account after only the counterparty changes', async () => {
      const journal = await createCashExpenseJournal('Unchanged account filter');
      const accountC = await accountWriteRepository.create({
        name: 'Account C',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        workplaceId: 'wp-1' as WorkplaceId,
      });

      await journalService.updateJournal(
        journal.id as JournalId,
        {
          description: 'Unchanged account filter',
          journalDate: journal.journalDate,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 10,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: accountC.id,
              amount: 10,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const results = await observeForAccounts([cashAccountId]);

      expect(results.some(j => j.id === journal.id)).toBe(true);
    });

    it('does not list a soft-deleted journal even when a deleted leg matched the account', async () => {
      const journal = await createCashExpenseJournal('Deleted journal filter');

      const beforeDelete = await observeForAccounts([expenseAccountId]);
      expect(beforeDelete.some(j => j.id === journal.id)).toBe(true);

      await journalService.deleteJournal(journal.id as JournalId, 'wp-1' as WorkplaceId);

      const afterDelete = await observeForAccounts([expenseAccountId]);
      expect(afterDelete.some(j => j.id === journal.id)).toBe(false);
    });
  });
});
