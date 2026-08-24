import { database } from '@/src/data/database/Database';
import { AccountType, TransactionType, JournalStatus } from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';

import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalListQueryRepository } from '@/src/data/repositories/journal/journalListQueryRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { ledgerWriteService } from '@/src/services/ledger';
import { prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';

const workplaceId = 'wp-write' as WorkplaceId;

describe('ledgerWriteService write paths', () => {
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

  it('createMany returns empty array without writing', async () => {
    const result = await ledgerWriteService.createMany([], workplaceId);
    expect(result).toEqual([]);
  });

  it('createMany batches multiple journals in one write', async () => {
    const date1 = Date.UTC(2024, 3, 1, 12, 0, 0);
    const date2 = Date.UTC(2024, 3, 2, 12, 0, 0);
    const prepared1 = await prepareJournalData(
      {
        description: 'One',
        journalDate: date1,
        currencyCode: 'USD',
        transactions: balancedLines(),
      },
      workplaceId,
    );
    const prepared2 = await prepareJournalData(
      {
        description: 'Two',
        journalDate: date2,
        currencyCode: 'USD',
        transactions: balancedLines(),
      },
      workplaceId,
    );

    const journals = await ledgerWriteService.createMany(
      [
        {
          data: {
            description: 'One',
            journalDate: date1,
            currencyCode: 'USD',
            transactions: balancedLines(),
          },
          prepared: prepared1,
        },
        {
          data: {
            description: 'Two',
            journalDate: date2,
            currencyCode: 'USD',
            transactions: balancedLines(),
          },
          prepared: prepared2,
        },
      ],
      workplaceId,
    );
    await rebuildQueueService.flush();

    expect(journals.length).toBe(2);
    const listed = await journalListQueryRepository.findAll(workplaceId);
    expect(listed.length).toBe(2);
  });

  it('updateJournal changes description and enqueues rebuild', async () => {
    const journal = await ledgerWriteService.createJournal(
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
    await ledgerWriteService.updateJournal(
      journal.id as JournalId,
      {
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

  it('updateJournal throws when journal is missing', async () => {
    await expect(
      ledgerWriteService.updateJournal(
        'missing' as JournalId,
        {
          description: 'Nope',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: balancedLines(),
        },
        workplaceId,
      ),
    ).rejects.toThrow(/Journal not found/);
  });

  it('creates a reversal and marks the original reversed in one write', async () => {
    const original = await ledgerWriteService.createJournal(
      {
        description: 'Lunch',
        journalDate: Date.now(),
        currencyCode: 'USD',
        transactions: balancedLines(),
      },
      workplaceId,
    );

    const writeSpy = jest.spyOn(database, 'write');
    const reversal = await ledgerWriteService.createReversalJournal(
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
      ledgerWriteService.createReversalJournal('missing' as JournalId, 'Refund', workplaceId),
    ).rejects.toThrow(/Original journal not found/);

    const listed = await journalListQueryRepository.findAll(workplaceId);
    expect(listed).toEqual([]);
  });

  it('does not commit a reversal for a foreign workplace journal', async () => {
    const original = await ledgerWriteService.createJournal(
      {
        description: 'Lunch',
        journalDate: Date.now(),
        currencyCode: 'USD',
        transactions: balancedLines(),
      },
      workplaceId,
    );

    await expect(
      ledgerWriteService.createReversalJournal(
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
