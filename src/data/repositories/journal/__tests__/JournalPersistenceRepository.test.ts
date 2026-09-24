import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import {
  journalPersistenceRepository,
  type PutJournalInput,
} from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { AccountType, JournalDisplayType, JournalStatus, TransactionType } from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

const WORKPLACE_ID = 'wp-journal-persistence' as WorkplaceId;

describe('JournalPersistenceRepository', () => {
  let debitAccountId: AccountId;
  let creditAccountId: AccountId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    const debitAccount = await accountWriteRepository.create({
      workplaceId: WORKPLACE_ID,
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const creditAccount = await accountWriteRepository.create({
      workplaceId: WORKPLACE_ID,
      name: 'Expense',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
    });
    debitAccountId = debitAccount.id;
    creditAccountId = creditAccount.id;
  });

  const lines = (debit = 10, credit = 10) => [
    {
      accountId: debitAccountId,
      amount: debit,
      transactionType: TransactionType.DEBIT,
    },
    {
      accountId: creditAccountId,
      amount: credit,
      transactionType: TransactionType.CREDIT,
    },
  ];

  const putInput = (overrides: Partial<PutJournalInput> = {}) => ({
    journalDate: 1_000,
    description: 'Journal',
    currencyCode: 'USD',
    displayType: JournalDisplayType.TRANSFER,
    transactions: lines(),
    ...overrides,
  });

  async function activeTransactions(journalId: JournalId): Promise<Transaction[]> {
    return database.collections
      .get<Transaction>('transactions')
      .query(
        Q.where('journal_id', journalId),
        Q.where('workplace_id', WORKPLACE_ID),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
  }

  it('persists a balanced posted journal with its lines in one repository operation', async () => {
    const result = await journalPersistenceRepository.put(putInput(), WORKPLACE_ID);
    const { journal } = result;

    expect(journal.status).toBe(JournalStatus.POSTED);
    expect(journal.totalAmount).toBe(10);
    expect(await activeTransactions(journal.id)).toHaveLength(2);
    expect(result.previousStatus).toBeUndefined();
    expect(result.status).toBe(JournalStatus.POSTED);
    expect(result.affectedAccountIds).toEqual(new Set([debitAccountId, creditAccountId]));
    expect(result.rebuildFromDate).toBe(1_000);
    expect(
      await database.collections
        .get('audit_logs')
        .query(Q.where('entity_id', journal.id), Q.where('workplace_id', WORKPLACE_ID))
        .fetchCount(),
    ).toBe(1);
  });

  it('allows an unbalanced planned journal but refuses to post it', async () => {
    const { journal } = await journalPersistenceRepository.put(
      putInput({ status: JournalStatus.PLANNED, transactions: lines(12, 10) }),
      WORKPLACE_ID,
    );

    expect(journal.status).toBe(JournalStatus.PLANNED);
    expect(journal.totalAmount).toBe(12);
    await expect(
      journalPersistenceRepository.post(journal.id, WORKPLACE_ID, 2_000),
    ).rejects.toThrow(/differ by/);

    const reloaded = await database.collections.get<Journal>('journals').find(journal.id);
    expect(reloaded.status).toBe(JournalStatus.PLANNED);
    expect(reloaded.journalDate).toBe(1_000);
  });

  it('posts a balanced planned journal and records its original planned date atomically', async () => {
    const { journal } = await journalPersistenceRepository.put(
      putInput({ status: JournalStatus.PLANNED }),
      WORKPLACE_ID,
    );

    const result = await journalPersistenceRepository.post(journal.id, WORKPLACE_ID, 2_000);

    const reloaded = await database.collections.get<Journal>('journals').find(journal.id);
    const [metadata] = await database.collections
      .get<JournalMetadata>('journal_metadata')
      .query(Q.where('journal_id', journal.id), Q.where('workplace_id', WORKPLACE_ID))
      .fetch();
    expect(reloaded.status).toBe(JournalStatus.POSTED);
    expect(result.previousStatus).toBe(JournalStatus.PLANNED);
    expect(result.status).toBe(JournalStatus.POSTED);
    expect(result.rebuildFromDate).toBe(1_000);
    expect(result.affectedAccountIds).toEqual(new Set([debitAccountId, creditAccountId]));
    expect(reloaded.journalDate).toBe(2_000);
    expect((await activeTransactions(journal.id)).map(line => line.transactionDate)).toEqual([
      2_000, 2_000,
    ]);
    expect(metadata.importSource).toBe('manual_post');
    expect(JSON.parse(metadata.metadataJson ?? '{}')).toMatchObject({ originalPlannedDate: 1_000 });
  });

  it('does not insert an unbalanced posted journal', async () => {
    await expect(
      journalPersistenceRepository.put(putInput({ transactions: lines(11, 10) }), WORKPLACE_ID),
    ).rejects.toThrow(/differ by/);

    expect(await database.collections.get<Journal>('journals').query().fetchCount()).toBe(0);
    expect(await database.collections.get<Transaction>('transactions').query().fetchCount()).toBe(
      0,
    );
    expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(0);
  });

  it('uses the persisted status when editing and leaves the old journal intact on rejection', async () => {
    const { journal } = await journalPersistenceRepository.put(putInput(), WORKPLACE_ID);

    await expect(
      journalPersistenceRepository.put(
        putInput({
          journalId: journal.id,
          description: 'Should not persist',
          transactions: lines(11, 10),
        }),
        WORKPLACE_ID,
      ),
    ).rejects.toThrow(/differ by/);

    const reloaded = await database.collections.get<Journal>('journals').find(journal.id);
    expect(reloaded.description).toBe('Journal');
    expect(reloaded.status).toBe(JournalStatus.POSTED);
    expect((await activeTransactions(journal.id)).map(line => line.amount)).toEqual([10, 10]);
    expect(
      await database.collections
        .get('audit_logs')
        .query(Q.where('entity_id', journal.id), Q.where('workplace_id', WORKPLACE_ID))
        .fetchCount(),
    ).toBe(1);
  });

  it('returns the old status and date from before a successful edit', async () => {
    const { journal } = await journalPersistenceRepository.put(
      putInput({ status: JournalStatus.PLANNED }),
      WORKPLACE_ID,
    );

    const result = await journalPersistenceRepository.put(
      putInput({
        journalId: journal.id,
        journalDate: 1_500,
        status: JournalStatus.POSTED,
      }),
      WORKPLACE_ID,
    );

    expect(result.previousStatus).toBe(JournalStatus.PLANNED);
    expect(result.status).toBe(JournalStatus.POSTED);
    expect(result.rebuildFromDate).toBe(1_000);
    expect(result.journal.journalDate).toBe(1_500);
  });

  it('rejects a posting line with more precision than its account currency supports', async () => {
    await expect(
      journalPersistenceRepository.put(
        putInput({ transactions: lines(10.001, 10.001) }),
        WORKPLACE_ID,
      ),
    ).rejects.toThrow(/precision/);
  });

  it('persists account currency from the account row instead of caller-provided line data', async () => {
    const { journal } = await journalPersistenceRepository.put(
      putInput({
        transactions: lines().map(line => ({ ...line, currencyCode: 'EUR' })),
      }),
      WORKPLACE_ID,
    );

    expect((await activeTransactions(journal.id)).map(line => line.currencyCode)).toEqual([
      'USD',
      'USD',
    ]);
  });

  it('commits a valid putMany batch together with one audit row per journal', async () => {
    const results = await journalPersistenceRepository.putMany(
      [
        putInput({ description: 'First', journalDate: 1_000 }),
        putInput({ description: 'Second', journalDate: 2_000 }),
      ],
      WORKPLACE_ID,
    );

    expect(results).toHaveLength(2);
    expect(await database.collections.get<Journal>('journals').query().fetchCount()).toBe(2);
    expect(await database.collections.get<Transaction>('transactions').query().fetchCount()).toBe(
      4,
    );
    expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(2);
  });

  it('rolls back every putMany write when any posted journal is unbalanced', async () => {
    await expect(
      journalPersistenceRepository.putMany(
        [
          putInput({ description: 'Valid first item' }),
          putInput({ description: 'Invalid second item', transactions: lines(11, 10) }),
        ],
        WORKPLACE_ID,
      ),
    ).rejects.toThrow(/differ by/);

    expect(await database.collections.get<Journal>('journals').query().fetchCount()).toBe(0);
    expect(await database.collections.get<Transaction>('transactions').query().fetchCount()).toBe(
      0,
    );
    expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(0);
  });

  it('creates a reversal and marks its original in the same writer batch', async () => {
    const { journal: original } = await journalPersistenceRepository.put(
      putInput({ journalDate: 1_000 }),
      WORKPLACE_ID,
    );

    const result = await journalPersistenceRepository.reverse(
      original.id,
      'Correction',
      WORKPLACE_ID,
      2_000,
    );
    const reloadedOriginal = await database.collections.get<Journal>('journals').find(original.id);
    const reversedLines = await activeTransactions(result.journal.id);

    expect(result.journal.originalJournalId).toBe(original.id);
    expect(result.journal.description).toContain('(Correction)');
    expect(reloadedOriginal.status).toBe(JournalStatus.REVERSED);
    expect(reloadedOriginal.reversingJournalId).toBe(result.journal.id);
    expect(reversedLines.map(line => line.transactionType)).toEqual([
      TransactionType.CREDIT,
      TransactionType.DEBIT,
    ]);
    expect(result.rebuildFromDate).toBe(1_000);
    expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(3);
  });

  it('does not reverse an unposted journal', async () => {
    const { journal } = await journalPersistenceRepository.put(
      putInput({ status: JournalStatus.PLANNED }),
      WORKPLACE_ID,
    );

    await expect(
      journalPersistenceRepository.reverse(journal.id, 'Correction', WORKPLACE_ID),
    ).rejects.toThrow(/Only a posted journal/);

    expect(await database.collections.get<Journal>('journals').query().fetchCount()).toBe(1);
    expect(await database.collections.get<Transaction>('transactions').query().fetchCount()).toBe(
      2,
    );
    expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(1);
  });

  it('rejects account reassignment when the resulting posted journal cannot be valued', async () => {
    const foreignAccount = await accountWriteRepository.create({
      workplaceId: WORKPLACE_ID,
      name: 'Euro account',
      accountType: AccountType.ASSET,
      currencyCode: 'EUR',
    });
    const { journal } = await journalPersistenceRepository.put(putInput(), WORKPLACE_ID);
    const [debitLine] = await activeTransactions(journal.id);
    const originalAccountId = debitLine.accountId;

    await expect(
      journalPersistenceRepository.reassignAccounts(
        {
          accountIdByTransactionId: new Map([[debitLine.id, foreignAccount.id]]),
          displayTypeByJournalId: new Map(),
        },
        WORKPLACE_ID,
      ),
    ).rejects.toThrow(/exchange rate/i);

    const unchanged = await database.collections
      .get<Transaction>('transactions')
      .find(debitLine.id);
    expect(unchanged.accountId).toBe(originalAccountId);
  });

  it('refuses to recover a posted journal whose restored lines are unbalanced', async () => {
    const { journal } = await journalPersistenceRepository.put(putInput(), WORKPLACE_ID);
    const linesBeforeDelete = await activeTransactions(journal.id);
    const deletedAt = new Date();
    await database.write(async () => {
      await database.batch(
        journal.prepareUpdate(record => {
          record.deletedAt = deletedAt;
        }),
        ...linesBeforeDelete.map(line =>
          line.prepareUpdate(record => {
            record.deletedAt = deletedAt;
            if (line.transactionType === TransactionType.DEBIT) record.amount = 11;
          }),
        ),
      );
    });

    await expect(journalPersistenceRepository.recover(journal.id, WORKPLACE_ID)).rejects.toThrow(
      /differ by/,
    );
    expect(
      (await database.collections.get<Journal>('journals').find(journal.id)).deletedAt?.getTime(),
    ).toBe(deletedAt.getTime());
    expect(
      await database.collections
        .get<Transaction>('transactions')
        .query(Q.where('journal_id', journal.id), Q.where('deleted_at', Q.eq(null)))
        .fetchCount(),
    ).toBe(0);
  });

  it('recovers only the transaction version deleted with the journal', async () => {
    const { journal } = await journalPersistenceRepository.put(putInput(), WORKPLACE_ID);
    const supersededLines = await activeTransactions(journal.id);
    await journalPersistenceRepository.put(
      putInput({ journalId: journal.id, journalDate: 1_500, description: 'Edited' }),
      WORKPLACE_ID,
    );
    const currentLines = await activeTransactions(journal.id);
    const deletedAt = new Date(Date.now() + 10_000);

    await database.write(async () => {
      await database.batch(
        journal.prepareUpdate(record => {
          record.deletedAt = deletedAt;
        }),
        ...currentLines.map(line =>
          line.prepareUpdate(record => {
            record.deletedAt = deletedAt;
          }),
        ),
      );
    });

    await journalPersistenceRepository.recover(journal.id, WORKPLACE_ID);

    const restoredLines = await activeTransactions(journal.id);
    expect(restoredLines.map(line => line.id).sort()).toEqual(
      currentLines.map(line => line.id).sort(),
    );
    for (const oldLine of supersededLines) {
      expect(
        (await database.collections.get<Transaction>('transactions').find(oldLine.id)).deletedAt,
      ).toBeDefined();
    }
  });

  it('rejects a bulk restore when one posted journal would be unbalanced', async () => {
    const first = await journalPersistenceRepository.put(
      putInput({ description: 'First' }),
      WORKPLACE_ID,
    );
    const second = await journalPersistenceRepository.put(
      putInput({ description: 'Second', journalDate: 2_000 }),
      WORKPLACE_ID,
    );
    const journals = [first.journal, second.journal];
    const linesToDelete = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('journal_id', Q.oneOf(journals.map(journal => journal.id))))
      .fetch();
    const deletedAt = new Date(Date.now() + 10_000);
    const debitToCorrupt = linesToDelete.find(
      line => line.transactionType === TransactionType.DEBIT,
    )!;
    const undoToken = {
      journals: journals.map(journal => ({ id: journal.id, deletedAt: deletedAt.getTime() })),
      transactions: linesToDelete.map(line => ({
        id: line.id,
        journalId: line.journalId,
        deletedAt: deletedAt.getTime(),
      })),
    };
    const auditCountBefore = await database.collections.get('audit_logs').query().fetchCount();

    await database.write(async () => {
      await database.batch(
        ...journals.map(journal =>
          journal.prepareUpdate(record => {
            record.deletedAt = deletedAt;
          }),
        ),
        ...linesToDelete.map(line =>
          line.prepareUpdate(record => {
            record.deletedAt = deletedAt;
            if (line.id === debitToCorrupt.id) record.amount = line.amount + 1;
          }),
        ),
      );
    });

    await expect(journalPersistenceRepository.bulkRestore(WORKPLACE_ID, undoToken)).rejects.toThrow(
      /differ by/,
    );
    expect(
      await database.collections
        .get<Journal>('journals')
        .query(Q.where('deleted_at', Q.eq(null)))
        .fetchCount(),
    ).toBe(0);
    expect(
      await database.collections
        .get<Transaction>('transactions')
        .query(Q.where('deleted_at', Q.eq(null)))
        .fetchCount(),
    ).toBe(0);
    expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(
      auditCountBefore,
    );
  });

  it('reverts a posted journal and its lines to the original planned date atomically', async () => {
    const { journal } = await journalPersistenceRepository.put(
      putInput({ status: JournalStatus.PLANNED }),
      WORKPLACE_ID,
    );
    await journalPersistenceRepository.post(journal.id, WORKPLACE_ID, 2_000);

    const result = await journalPersistenceRepository.revertToPlanned(journal.id, WORKPLACE_ID);
    const reloaded = await database.collections.get<Journal>('journals').find(journal.id);

    expect(result.previousStatus).toBe(JournalStatus.POSTED);
    expect(reloaded.status).toBe(JournalStatus.PLANNED);
    expect(reloaded.journalDate).toBe(1_000);
    expect((await activeTransactions(journal.id)).map(line => line.transactionDate)).toEqual([
      1_000, 1_000,
    ]);
  });
});
