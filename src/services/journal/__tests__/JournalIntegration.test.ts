import {
  AccountType,
  InboxParseStatus,
  InboxProcessingStatus,
  JournalStatus,
  TransactionDirection,
  TransactionType,
} from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
/**
 * Integration tests for journal write/read modules (ledger + journal query repositories).
 * Tests double-entry accounting, precision handling, and balance integrity.
 */

import { database } from '@/src/data/database/Database';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';

import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';

import { accountWriteRepository } from '@/src/data/repositories/account';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import { journalService } from '@/src/services/journal/journalDomainService';
import { observeEnrichedJournals } from '@/src/services/journal/journalTimelineReadModel';
import { ledgerCreateService } from '@/src/services/ledger/ledgerCreateService';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { Q } from '@nozbe/watermelondb';

describe('Journal ledger integration', () => {
  let cashAccountId: string;
  let expenseAccountId: string;
  let incomeAccountId: string;

  beforeEach(async () => {
    rebuildQueueService.stop();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    await workplaceRepository.create({
      id: 'wp-1' as WorkplaceId,
      name: 'Test Workplace',
      icon: 'wallet',
      defaultCurrencyCode: 'USD',
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

  describe('standard persistence service cutover', () => {
    it('rejects an unbalanced posted create before writing journal, lines, or audit', async () => {
      await expect(
        journalService.createJournal(
          {
            journalDate: 1_700_000_000_000,
            currencyCode: 'USD',
            transactions: [
              {
                accountId: cashAccountId as AccountId,
                amount: 100,
                transactionType: TransactionType.DEBIT,
              },
              {
                accountId: expenseAccountId as AccountId,
                amount: 50,
                transactionType: TransactionType.CREDIT,
              },
            ],
          },
          'wp-1' as WorkplaceId,
        ),
      ).rejects.toThrow('Journal debits and credits differ by 50.00 USD');

      expect(await database.collections.get<Journal>('journals').query().fetchCount()).toBe(0);
      expect(await database.collections.get('transactions').query().fetchCount()).toBe(0);
      expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(0);
    }, 10000);

    it('saves a manual bulk request through one atomic persistence batch', async () => {
      const response = await journalService.saveBulkJournalEntries(
        [10, 20].map((amount, index) => ({
          description: `Bulk entry ${index + 1}`,
          journalDate: 1_700_000_000_000 + index,
          workplaceId: 'wp-1' as WorkplaceId,
          lines: [
            {
              id: `debit-${index}` as any,
              accountId: cashAccountId as AccountId,
              accountName: 'Cash',
              accountType: AccountType.ASSET,
              accountCurrency: 'USD',
              amount: String(amount),
              transactionType: TransactionType.DEBIT,
              notes: '',
              exchangeRate: '',
            },
            {
              id: `credit-${index}` as any,
              accountId: expenseAccountId as AccountId,
              accountName: 'Food',
              accountType: AccountType.EXPENSE,
              accountCurrency: 'USD',
              amount: String(amount),
              transactionType: TransactionType.CREDIT,
              notes: '',
              exchangeRate: '',
            },
          ],
        })),
      );

      if (!response.success) throw new Error(response.error ?? 'Bulk save failed');
      expect(response).toMatchObject({
        success: true,
        summaries: [{ amount: 10 }, { amount: 20 }],
      });
      expect(await database.collections.get<Journal>('journals').query().fetchCount()).toBe(2);
      expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(2);
      await rebuildQueueService.flush();
      expect(
        (
          await balanceReadService.getAccountBalance(
            cashAccountId as AccountId,
            'wp-1' as WorkplaceId,
          )
        ).balance,
      ).toBe(30);
    }, 10000);

    it('reverses an entry through the new repository boundary', async () => {
      const original = await journalService.createJournal(
        {
          description: 'Original entry',
          journalDate: 1_700_000_000_000,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 40,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 40,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const reversal = await journalService.createReversalJournal(
        original.id,
        'Correction',
        'wp-1' as WorkplaceId,
      );
      const markedOriginal = await database.collections.get<Journal>('journals').find(original.id);

      expect(reversal.originalJournalId).toBe(original.id);
      expect(reversal.description).toContain('(Correction)');
      expect(markedOriginal.status).toBe(JournalStatus.REVERSED);
      expect(markedOriginal.reversingJournalId).toBe(reversal.id);
      await rebuildQueueService.flush();
      expect(
        (
          await balanceReadService.getAccountBalance(
            cashAccountId as AccountId,
            'wp-1' as WorkplaceId,
          )
        ).balance,
      ).toBe(0);
    }, 10000);

    it('creates, edits, and posts through the guarded write boundary with atomic audit metadata', async () => {
      const plannedDate = 1_700_000_000_000;
      const journal = await journalService.createJournal(
        {
          description: 'Planned entry',
          journalDate: plannedDate,
          currencyCode: 'USD',
          status: JournalStatus.PLANNED,
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 50,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 50,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const editedDate = plannedDate + 1_000;
      await journalService.updateJournal(
        journal.id,
        {
          description: 'Edited planned entry',
          journalDate: editedDate,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 75,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 75,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const posted = await journalService.postJournal(journal.id, 'wp-1' as WorkplaceId);
      const metadata = await database.collections
        .get<JournalMetadata>('journal_metadata')
        .query(Q.where('journal_id', journal.id), Q.where('workplace_id', 'wp-1'))
        .fetch();
      const auditCount = await database.collections
        .get('audit_logs')
        .query(Q.where('entity_id', journal.id), Q.where('workplace_id', 'wp-1'))
        .fetchCount();

      expect(posted.status).toBe(JournalStatus.POSTED);
      expect(posted.journalDate).toBeGreaterThan(editedDate);
      expect(metadata).toHaveLength(1);
      expect(JSON.parse(metadata[0].metadataJson ?? '{}')).toMatchObject({
        originalPlannedDate: editedDate,
      });
      expect(auditCount).toBe(3);
      expect(
        await transactionQueryRepository.findByJournal('wp-1' as WorkplaceId, journal.id),
      ).toHaveLength(2);

      await rebuildQueueService.flush();
      expect(
        (
          await balanceReadService.getAccountBalance(
            cashAccountId as AccountId,
            'wp-1' as WorkplaceId,
          )
        ).balance,
      ).toBe(75);
    }, 10000);
  });

  describe('SMS-linked manual journal creation', () => {
    async function createInboxRecord(deviceSourceId: string) {
      let recordId = '';
      await transactionInboxRepository.persistScanBatch(() => {
        const prepared = transactionInboxRepository.prepareUpsert(
          {
            workplaceId: 'wp-1' as WorkplaceId,
            channel: 'sms',
            deviceSourceId,
            inputDate: 1_700_000_000_000,
            inputFingerprint: `fingerprint-${deviceSourceId}`,
            parseStatus: InboxParseStatus.PARSED,
            direction: TransactionDirection.DEBIT,
            processingStatus: InboxProcessingStatus.PENDING,
            firstSeenAt: 1_700_000_000_000,
            lastScannedAt: 1_700_000_000_000,
          },
          null,
        );
        recordId = prepared.record.id;
        return prepared.ops;
      });
      return transactionInboxRepository.find('wp-1' as WorkplaceId, recordId);
    }

    it('links a valid journal and leaves the inbox unchanged when posting validation fails', async () => {
      const firstRecord = await createInboxRecord('manual-sms-valid');
      const journal = await journalService.createJournal(
        {
          journalDate: 1_700_000_000_000,
          description: 'SMS expense',
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 20,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 20,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
        firstRecord,
      );
      const linkedRecord = await transactionInboxRepository.find(
        'wp-1' as WorkplaceId,
        firstRecord!.id,
      );
      expect(linkedRecord?.linkedJournalId).toBe(journal.id);
      expect(linkedRecord?.processingStatus).toBe(InboxProcessingStatus.IMPORTED);

      const secondRecord = await createInboxRecord('manual-sms-invalid');
      await expect(
        journalService.createJournal(
          {
            journalDate: 1_700_000_000_001,
            description: 'Unbalanced SMS expense',
            currencyCode: 'USD',
            transactions: [
              {
                accountId: cashAccountId as AccountId,
                amount: 21,
                transactionType: TransactionType.CREDIT,
              },
              {
                accountId: expenseAccountId as AccountId,
                amount: 20,
                transactionType: TransactionType.DEBIT,
              },
            ],
          },
          'wp-1' as WorkplaceId,
          secondRecord,
        ),
      ).rejects.toThrow(/differ by/);

      const unchangedInboxRecord = await transactionInboxRepository.find(
        'wp-1' as WorkplaceId,
        secondRecord!.id,
      );
      expect(unchangedInboxRecord?.linkedJournalId).toBeNull();
      expect(unchangedInboxRecord?.processingStatus).toBe(InboxProcessingStatus.PENDING);
      expect(await database.collections.get<Journal>('journals').query().fetchCount()).toBe(1);
    }, 10000);
  });

  describe('createJournalWithTransactions', () => {
    it('should create a balanced journal successfully', async () => {
      const journal = await ledgerCreateService.createJournal(
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
        ledgerCreateService.createJournal(
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
      ).rejects.toThrow('Journal debits and credits differ by 50.00 USD');
    });

    it('does not persist a foreign journal with a one-minor-unit FX difference', async () => {
      const thaiAccount = await accountWriteRepository.create({
        name: 'Thai expense',
        accountType: AccountType.EXPENSE,
        currencyCode: 'THB',
        workplaceId: 'wp-1' as WorkplaceId,
      });
      const rupeeAccount = await accountWriteRepository.create({
        name: 'Rupee bank',
        accountType: AccountType.ASSET,
        currencyCode: 'INR',
        workplaceId: 'wp-1' as WorkplaceId,
      });

      await expect(
        ledgerCreateService.createJournal(
          {
            description: 'Rounded foreign expense',
            journalDate: Date.now(),
            currencyCode: 'INR',
            transactions: [
              {
                accountId: thaiAccount.id as AccountId,
                amount: 76.82,
                transactionType: TransactionType.DEBIT,
                currencyCode: 'THB',
                exchangeRate: 2.89,
              },
              {
                accountId: rupeeAccount.id as AccountId,
                amount: 222,
                transactionType: TransactionType.CREDIT,
                currencyCode: 'INR',
              },
            ],
          },
          'wp-1' as WorkplaceId,
        ),
      ).rejects.toThrow('0.01 INR');

      const journalCount = await database.collections.get<Journal>('journals').query().fetchCount();
      expect(journalCount).toBe(0);
    });

    it('should handle multi-leg journals', async () => {
      // Receive salary and immediately pay some expense
      const journal = await ledgerCreateService.createJournal(
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
      await ledgerCreateService.createJournal(
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

      const cashBalance = await balanceReadService.getAccountBalance(
        cashAccountId as AccountId,
        'wp-1' as WorkplaceId,
      );
      expect(cashBalance.balance).toBe(500);

      const incomeBalance = await balanceReadService.getAccountBalance(
        incomeAccountId as AccountId,
        'wp-1' as WorkplaceId,
      );
      expect(incomeBalance.balance).toBe(500);
    });
  });

  describe('updateJournalWithTransactions', () => {
    it('should update journal and recalculate balances', async () => {
      const journal = await ledgerCreateService.createJournal(
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
          currencyCode: 'INR',
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
      expect(updatedJournal!.currencyCode).toBe('USD');
      const updatedTransactions = await transactionQueryRepository.findByJournal(
        'wp-1' as WorkplaceId,
        journal.id as JournalId,
      );
      expect(updatedTransactions.every(transaction => transaction.currencyCode === 'USD')).toBe(
        true,
      );
    }, 10000);
  });

  describe('duplicateJournal', () => {
    it('should duplicate a journal and its transactions', async () => {
      const originalJournal = await ledgerCreateService.createJournal(
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
      const duplicatedTransactions = await transactionQueryRepository.findByJournal(
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
      const journal = await ledgerCreateService.createJournal(
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
      await ledgerCreateService.createJournal(
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
      await ledgerCreateService.createJournal(
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
      await ledgerCreateService.createJournal(
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
      const journal = await ledgerCreateService.createJournal(
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
      const journal = await ledgerCreateService.createJournal(
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
      return ledgerCreateService.createJournal(
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
