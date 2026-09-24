import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { database } from '@/src/data/database/Database';
import { AccountType, JournalDisplayType, TransactionType, JournalStatus } from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';

import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalListQueryRepository } from '@/src/data/repositories/journal/journalListQueryRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';

const workplaceId = 'wp-write' as WorkplaceId;

describe('JournalPersistenceService write paths', () => {
  let cashAccountId: AccountId;
  let expenseAccountId: AccountId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    const cash = await accountWriteRepository.create({
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const expense = await accountWriteRepository.create({
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId,
    });
    cashAccountId = cash.id;
    expenseAccountId = expense.id;
  }, 30000);

  afterAll(() => {
    rebuildQueueService.stop();
  });

  const balancedLines = () => [
    {
      accountId: cashAccountId,
      amount: 25,
      transactionType: TransactionType.CREDIT,
    },
    {
      accountId: expenseAccountId,
      amount: 25,
      transactionType: TransactionType.DEBIT,
    },
  ];

  it('putMany returns an empty array without writing', async () => {
    const result = await journalPersistenceService.putMany([], workplaceId);
    expect(result).toEqual([]);
  });

  it('putMany saves multiple journals in one write', async () => {
    const date1 = Date.UTC(2024, 3, 1, 12, 0, 0);
    const date2 = Date.UTC(2024, 3, 2, 12, 0, 0);
    const journals = await journalPersistenceService.putMany(
      [
        {
          description: 'One',
          journalDate: date1,
          currencyCode: 'USD',
          transactions: balancedLines(),
        },
        {
          description: 'Two',
          journalDate: date2,
          currencyCode: 'USD',
          transactions: balancedLines(),
        },
      ],
      workplaceId,
    );
    await rebuildQueueService.flush();

    expect(journals.length).toBe(2);
    const listed = await journalListQueryRepository.findAll(workplaceId);
    expect(listed.length).toBe(2);
  });

  it('put updates an existing journal and enqueues rebuild', async () => {
    const journal = await journalPersistenceService.put(
      {
        description: 'Before',
        journalDate: Date.now(),
        currencyCode: 'USD',
        transactions: balancedLines(),
      },
      workplaceId,
    );
    await rebuildQueueService.flush();

    const newDate = Date.UTC(2024, 6, 1, 12, 0, 0);
    await journalPersistenceService.put(
      {
        journalId: journal.id as JournalId,
        description: 'After',
        journalDate: newDate,
        currencyCode: 'USD',
        transactions: balancedLines(),
      },
      workplaceId,
    );
    await rebuildQueueService.flush();

    const updated = await journalQueryRepository.find(workplaceId, journal.id as JournalId);
    expect(updated?.description).toBe('After');
    expect(updated?.journalDate).toBe(newDate);
  });

  it('generic sparse put updates journal fields without replacing transaction rows', async () => {
    const journal = await journalPersistenceService.put(
      {
        description: 'Before sparse update',
        journalDate: Date.now(),
        currencyCode: 'USD',
        transactions: balancedLines(),
      },
      workplaceId,
    );
    const originalTransactions = await transactionQueryRepository.findByJournal(
      workplaceId,
      journal.id as JournalId,
    );

    await journalPersistenceService.put(
      { journalId: journal.id as JournalId, description: 'After sparse update' },
      workplaceId,
    );

    const updated = await journalQueryRepository.find(workplaceId, journal.id as JournalId);
    const savedTransactions = await transactionQueryRepository.findByJournal(
      workplaceId,
      journal.id as JournalId,
    );
    expect(updated?.description).toBe('After sparse update');
    expect(savedTransactions.map(transaction => transaction.id)).toEqual(
      originalTransactions.map(transaction => transaction.id),
    );
    expect(savedTransactions.map(transaction => transaction.amount)).toEqual(
      originalTransactions.map(transaction => transaction.amount),
    );
  });

  it('put throws when the requested journal is missing', async () => {
    await expect(
      journalPersistenceService.put(
        {
          journalId: 'missing' as JournalId,
          description: 'Nope',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: balancedLines(),
        },
        workplaceId,
      ),
    ).rejects.toThrow(/Journal not found/);
  });

  it('repository rejects an unbalanced update to an already-posted journal without changing it', async () => {
    const journal = await journalPersistenceService.put(
      {
        description: 'Posted before',
        journalDate: Date.now(),
        currencyCode: 'USD',
        transactions: balancedLines(),
      },
      workplaceId,
    );

    await expect(
      journalPersistenceRepository.put(
        {
          journalId: journal.id as JournalId,
          description: 'Should not save',
          journalDate: Date.now(),
          currencyCode: 'USD',
          displayType: JournalDisplayType.TRANSFER,
          transactions: [
            {
              accountId: cashAccountId,
              amount: 25,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId,
              amount: 24.99,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        workplaceId,
      ),
    ).rejects.toThrow('0.01 USD');

    const savedJournal = await journalQueryRepository.find(workplaceId, journal.id as JournalId);
    const savedTransactions = await transactionQueryRepository.findByJournal(
      workplaceId,
      journal.id as JournalId,
    );
    expect(savedJournal?.description).toBe('Posted before');
    expect(savedTransactions.map(transaction => transaction.amount)).toEqual([25, 25]);
  });

  it('allows an unbalanced planned journal but rejects posting it', async () => {
    const journal = await journalPersistenceService.put(
      {
        description: 'Unbalanced planned journal',
        journalDate: Date.now(),
        currencyCode: 'USD',
        status: JournalStatus.PLANNED,
        transactions: [
          {
            accountId: cashAccountId,
            amount: 25,
            transactionType: TransactionType.CREDIT,
          },
          {
            accountId: expenseAccountId,
            amount: 24.99,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      workplaceId,
    );

    expect(journal.status).toBe(JournalStatus.PLANNED);
    await expect(
      journalPersistenceService.post(journal.id as JournalId, workplaceId),
    ).rejects.toThrow('0.01 USD');
    expect((await journalQueryRepository.find(workplaceId, journal.id as JournalId))?.status).toBe(
      JournalStatus.PLANNED,
    );
  });

  it('allows an unbalanced planned update but rejects changing that update to POSTED', async () => {
    const journal = await journalPersistenceService.put(
      {
        description: 'Planned balanced journal',
        journalDate: Date.now(),
        currencyCode: 'USD',
        status: JournalStatus.PLANNED,
        transactions: balancedLines(),
      },
      workplaceId,
    );
    const unbalancedData = {
      description: 'Planned unbalanced journal',
      journalDate: Date.now(),
      currencyCode: 'USD',
      transactions: [
        {
          accountId: cashAccountId,
          amount: 25,
          transactionType: TransactionType.CREDIT,
        },
        {
          accountId: expenseAccountId,
          amount: 24.99,
          transactionType: TransactionType.DEBIT,
        },
      ],
    };

    await journalPersistenceService.put(
      { ...unbalancedData, journalId: journal.id as JournalId },
      workplaceId,
    );
    expect((await journalQueryRepository.find(workplaceId, journal.id as JournalId))?.status).toBe(
      JournalStatus.PLANNED,
    );

    await expect(
      journalPersistenceService.put(
        { ...unbalancedData, journalId: journal.id as JournalId, status: JournalStatus.POSTED },
        workplaceId,
      ),
    ).rejects.toThrow('0.01 USD');
    expect(
      (await journalQueryRepository.find(workplaceId, journal.id as JournalId))?.description,
    ).toBe('Planned unbalanced journal');
  });

  it('repository rejects an unbalanced posted create before persisting any rows', async () => {
    await expect(
      journalPersistenceRepository.putMany(
        [
          {
            journalDate: Date.now(),
            description: 'Unbalanced posted create',
            currencyCode: 'USD',
            displayType: JournalDisplayType.TRANSFER,
            transactions: [
              {
                accountId: cashAccountId,
                amount: 25,
                transactionType: TransactionType.CREDIT,
              },
              {
                accountId: expenseAccountId,
                amount: 24.99,
                transactionType: TransactionType.DEBIT,
              },
            ],
          },
        ],
        workplaceId,
      ),
    ).rejects.toThrow('0.01 USD');

    expect(await journalListQueryRepository.findAll(workplaceId)).toHaveLength(0);
  });

  it('repository rejects account reassignment that breaks a posted journal balance', async () => {
    const foreignCurrencyAccount = await accountWriteRepository.create({
      name: 'Euro account',
      accountType: AccountType.ASSET,
      currencyCode: 'EUR',
      workplaceId,
    });
    const journal = await journalPersistenceService.put(
      {
        description: 'Posted transfer',
        journalDate: Date.now(),
        currencyCode: 'USD',
        transactions: balancedLines(),
      },
      workplaceId,
    );
    const transactions = await transactionQueryRepository.findByJournal(
      workplaceId,
      journal.id as JournalId,
    );
    const debitLine = transactions.find(
      transaction => transaction.transactionType === TransactionType.DEBIT,
    )!;

    await expect(
      journalPersistenceRepository.reassignAccounts(
        {
          accountIdByTransactionId: new Map([[debitLine.id, foreignCurrencyAccount.id]]),
          displayTypeByJournalId: new Map(),
        },
        workplaceId,
      ),
    ).rejects.toThrow(/exchange rate/i);

    const savedDebitLine = (
      await transactionQueryRepository.findByJournal(workplaceId, journal.id as JournalId)
    ).find(transaction => transaction.id === debitLine.id);
    expect(savedDebitLine?.accountId).toBe(expenseAccountId);
  });

  it('creates a reversal and marks the original reversed in one write', async () => {
    const original = await journalPersistenceService.put(
      {
        description: 'Lunch',
        journalDate: Date.now(),
        currencyCode: 'USD',
        transactions: balancedLines(),
      },
      workplaceId,
    );

    const writeSpy = jest.spyOn(database, 'write');
    const reversal = await journalPersistenceService.reverse(
      original.id as JournalId,
      'Refund',
      workplaceId,
    );
    expect(writeSpy).toHaveBeenCalledTimes(1);
    writeSpy.mockRestore();

    const reversed = await journalQueryRepository.find(workplaceId, original.id as JournalId);
    expect(reversed?.status).toBe(JournalStatus.REVERSED);
    expect(reversed?.reversingJournalId).toBe(reversal.id);
    expect(reversal.originalJournalId).toBe(original.id);
    expect(reversal.description).toContain('Reversal of:');
    expect(reversal.description).toContain('Refund');
  });

  it('does not commit a reversal when the original journal is missing', async () => {
    await expect(
      journalPersistenceService.reverse('missing' as JournalId, 'Refund', workplaceId),
    ).rejects.toThrow(/Original journal not found/);

    const listed = await journalListQueryRepository.findAll(workplaceId);
    expect(listed).toEqual([]);
  });

  it('does not commit a reversal for a foreign workplace journal', async () => {
    const original = await journalPersistenceService.put(
      {
        description: 'Lunch',
        journalDate: Date.now(),
        currencyCode: 'USD',
        transactions: balancedLines(),
      },
      workplaceId,
    );

    await expect(
      journalPersistenceService.reverse(
        original.id as JournalId,
        'Refund',
        'wp-other' as WorkplaceId,
      ),
    ).rejects.toThrow(/Original journal not found/);

    const listed = await journalListQueryRepository.findAll(workplaceId);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(original.id);
    expect(listed[0].status).not.toBe(JournalStatus.REVERSED);
  });
});
