import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';

import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalService } from '@/src/services/journal/journalDomainService';
import { observeEnrichedJournals } from '@/src/services/journal/journalTimelineReadModel';

import {
  balancedUsdExpenseTransactions,
  resetJournalIntegrationWorkplace,
} from '@/src/testing/journalFixtures';
import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import { firstValueFrom, filter, take, timeout } from 'rxjs';

jest.setTimeout(30_000);

describe('Journal ledger integration @slow', () => {
  let cashAccountId: string;
  let expenseAccountId: string;

  beforeEach(async () => {
    ({ cashAccountId, expenseAccountId } = await resetJournalIntegrationWorkplace());
  }, 10000);

  describe('observeEnrichedJournals search functionality', () => {
    async function firstSearchResults(query: string) {
      const observable = observeEnrichedJournals('wp-1' as WorkplaceId, 10, undefined, query);
      return new Promise<any[]>(resolve => {
        const subscription = observable.subscribe(data => {
          subscription.unsubscribe();
          resolve(data);
        });
      });
    }

    it.each([
      {
        description: 'Unique test description',
        notes: 'Some notes',
        query: 'Unique test',
        expectedLength: 1,
        assert: (results: { description: string; notes?: string }[]) => {
          expect(results[0].description).toBe('Unique test description');
        },
      },
      {
        description: 'Another entry',
        notes: 'Unique test notes',
        query: 'Unique test notes',
        expectedLength: 1,
        assert: (results: { description: string; notes?: string }[]) => {
          expect(results[0].notes).toBe('Unique test notes');
        },
      },
      {
        description: 'Standard description',
        notes: 'Standard notes',
        query: 'Non-existent match',
        expectedLength: 0,
        assert: () => undefined,
      },
    ])(
      'filters journals by search query ($query)',
      async ({ description, notes, query, expectedLength, assert }) => {
        await journalPersistenceService.put(
          {
            description,
            notes,
            journalDate: Date.now(),
            currencyCode: 'USD',
            transactions: balancedUsdExpenseTransactions(cashAccountId, expenseAccountId, 10),
          },
          'wp-1' as WorkplaceId,
        );

        const results = await firstSearchResults(query);
        expect(results).toHaveLength(expectedLength);
        assert(results);
      },
    );
  });

  describe('observeEnrichedJournals reactive updates', () => {
    it('refreshes saved account colors without editing the journal and stops after unsubscribe', async () => {
      const journal = await journalPersistenceService.put(
        {
          description: 'Account color test',
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
      const observable = observeEnrichedJournals('wp-1' as WorkplaceId, 10);
      const states: string[] = [];
      const subscription = observable.subscribe(journals => {
        const entry = journals.find(entry => entry.id === journal.id);
        if (entry)
          states.push(entry.accounts.find(account => account.id === cashAccountId)?.color ?? '');
      });
      const account = await database.collections.get<Account>('accounts').find(cashAccountId);
      try {
        await firstValueFrom(observable.pipe(take(1), timeout(2000)));
        for (const color of ['#CDAA6B', '#65C6AD', '']) {
          const updated = firstValueFrom(
            observable.pipe(
              filter(journals =>
                journals.some(
                  entry =>
                    entry.id === journal.id &&
                    entry.accounts.some(
                      leg => leg.id === cashAccountId && (leg.color ?? '') === color,
                    ),
                ),
              ),
              take(1),
              timeout(2000),
            ),
          );
          await database.write(() =>
            account.update(record => {
              record.color = color;
            }),
          );
          await updated;
        }
        expect(states).toEqual(['', '#CDAA6B', '#65C6AD', '']);
      } finally {
        subscription.unsubscribe();
      }
      const emissionCount = states.length;
      await database.write(() =>
        account.update(record => {
          record.color = '#CDAA6B';
        }),
      );
      expect(states).toHaveLength(emissionCount);
    });

    it('should emit updated accounts when a journal accounts are modified', async () => {
      // 1. Create a journal with account A and account B
      const journal = await journalPersistenceService.put(
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
      const journal = await journalPersistenceService.put(
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
      return journalPersistenceService.put(
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
