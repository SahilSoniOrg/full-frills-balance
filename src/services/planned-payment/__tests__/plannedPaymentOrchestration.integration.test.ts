import { AppConfig } from '@/src/constants';
import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import { database } from '@/src/data/database/Database';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { generatePlannedOccurrence } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
import {
  processDuePlannedPayments,
  postPlannedJournalOccurrence,
  postPlannedPaymentOccurrence,
  skipPlannedPaymentOccurrence,
} from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import {
  AccountType,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

const WORKPLACE_ID = 'wp-planned-atomic' as WorkplaceId;

describe('planned payment orchestration persistence', () => {
  let fromAccountId: AccountId;
  let toAccountId: AccountId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    const from = await accountWriteRepository.create({
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_ID,
    });
    const to = await accountWriteRepository.create({
      name: 'Rent',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_ID,
    });

    fromAccountId = from.id;
    toAccountId = to.id;
  }, 30000);

  afterAll(() => {
    rebuildQueueService.stop();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function createDuePayment(name = 'Rent'): Promise<PlannedPayment> {
    const occurrence = normalizeToStartOfDay(Date.now());
    return plannedPaymentRepository.create(WORKPLACE_ID, {
      name,
      amount: 1200,
      currencyCode: 'USD',
      fromAccountId,
      toAccountId,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.DAILY,
      startDate: occurrence,
      endDate: occurrence,
      nextOccurrence: occurrence,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
    });
  }

  it('creates the journal and advances nextOccurrence in one writer batch', async () => {
    const payment = await createDuePayment();
    const expectedNextOccurrence = calculateNextOccurrence(payment.nextOccurrence, payment);
    const writeSpy = jest.spyOn(database, 'write');
    const batchSpy = jest.spyOn(database, 'batch');

    await processDuePlannedPayments(WORKPLACE_ID);

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);

    expect(journals).toHaveLength(1);
    expect(journals[0].status).toBe(JournalStatus.PLANNED);
    expect(reloaded?.nextOccurrence).toBe(expectedNextOccurrence);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy).toHaveBeenCalledTimes(1);
  }, 30000);

  it('posts an existing planned occurrence with its schedule advance in one batch', async () => {
    const payment = await createDuePayment();
    const occurrenceDate = payment.nextOccurrence;
    await journalPersistenceService.put(
      {
        journalDate: occurrenceDate,
        description: payment.name,
        currencyCode: payment.currencyCode,
        transactions: buildPlannedPaymentTransferLines(payment),
        status: JournalStatus.PLANNED,
        plannedPaymentId: payment.id,
      },
      WORKPLACE_ID,
    );
    const expectedNextOccurrence = calculateNextOccurrence(occurrenceDate, payment);
    const writeSpy = jest.spyOn(database, 'write');
    const batchSpy = jest.spyOn(database, 'batch');

    await postPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, occurrenceDate);

    const [journal] = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);
    expect(journal.status).toBe(JournalStatus.POSTED);
    expect(reloaded?.nextOccurrence).toBe(expectedNextOccurrence);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy).toHaveBeenCalledTimes(1);

    await expect(
      postPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, occurrenceDate),
    ).rejects.toThrow(/already has a journal/);
    expect(batchSpy).toHaveBeenCalledTimes(1);
  }, 30000);

  it('allows this month after last month was posted today', async () => {
    const payment = await createDuePayment();
    const currentOccurrence = payment.nextOccurrence;
    const currentDate = new Date(currentOccurrence);
    const previousMonthLastDay = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      0,
    ).getDate();
    const previousOccurrence = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - 1,
      Math.min(currentDate.getDate(), previousMonthLastDay),
    ).getTime();

    await postPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, previousOccurrence);
    const [previousPostedJournal] = await journalPlannedQueries.findByPlannedPaymentIds(
      WORKPLACE_ID,
      [payment.id],
    );
    expect(previousPostedJournal.status).toBe(JournalStatus.POSTED);
    expect(previousPostedJournal.journalDate).toBeGreaterThanOrEqual(currentOccurrence);

    await journalPersistenceService.put(
      {
        journalDate: currentOccurrence,
        description: payment.name,
        currencyCode: payment.currencyCode,
        transactions: buildPlannedPaymentTransferLines(payment),
        status: JournalStatus.PLANNED,
        plannedPaymentId: payment.id,
      },
      WORKPLACE_ID,
    );

    await postPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, currentOccurrence);

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    expect(journals).toHaveLength(2);
    expect(journals.every(journal => journal.status === JournalStatus.POSTED)).toBe(true);
  }, 30000);

  it('posts the exact planned journal selected by the occurrence action', async () => {
    const payment = await createDuePayment();
    const occurrenceDate = payment.nextOccurrence;
    const scheduledJournal = await journalPersistenceService.put(
      {
        journalDate: occurrenceDate,
        description: payment.name,
        currencyCode: payment.currencyCode,
        transactions: buildPlannedPaymentTransferLines(payment),
        status: JournalStatus.PLANNED,
        plannedPaymentId: payment.id,
      },
      WORKPLACE_ID,
    );
    const lookupSpy = jest.spyOn(journalPlannedQueries, 'findOccurrenceJournals');

    await postPlannedJournalOccurrence(
      WORKPLACE_ID,
      payment.id,
      scheduledJournal.id,
      occurrenceDate,
    );

    const reloaded = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloadedPayment = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].id).toBe(scheduledJournal.id);
    expect(reloaded[0].status).toBe(JournalStatus.POSTED);
    expect(reloadedPayment?.nextOccurrence).toBe(calculateNextOccurrence(occurrenceDate, payment));
    expect(lookupSpy).toHaveBeenCalledTimes(1);
  }, 30000);

  it('rejects a selected planned journal from a different occurrence date', async () => {
    const payment = await createDuePayment();
    const occurrenceDate = payment.nextOccurrence;
    const scheduledJournal = await journalPersistenceService.put(
      {
        journalDate: occurrenceDate,
        description: payment.name,
        currencyCode: payment.currencyCode,
        transactions: buildPlannedPaymentTransferLines(payment),
        status: JournalStatus.PLANNED,
        plannedPaymentId: payment.id,
      },
      WORKPLACE_ID,
    );

    await expect(
      postPlannedJournalOccurrence(
        WORKPLACE_ID,
        payment.id,
        scheduledJournal.id,
        occurrenceDate + AppConfig.time.msPerDay,
      ),
    ).rejects.toThrow(/not scheduled for this occurrence/);

    const [reloaded] = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    expect(reloaded.status).toBe(JournalStatus.PLANNED);
  }, 30000);

  it('posts a scheduled occurrence committed while its write is queued', async () => {
    const payment = await createDuePayment();
    const occurrenceDate = payment.nextOccurrence;
    let releaseGeneration!: () => void;
    let signalGeneration!: () => void;
    const generationPaused = new Promise<void>(resolve => {
      signalGeneration = resolve;
    });
    const continueGeneration = new Promise<void>(resolve => {
      releaseGeneration = resolve;
    });
    let signalPostWrite!: () => void;
    const postWriteStarted = new Promise<void>(resolve => {
      signalPostWrite = resolve;
    });
    const databaseWrite = database.write.bind(database);
    let writeCount = 0;
    const findOccurrenceJournals =
      journalPlannedQueries.findOccurrenceJournals.bind(journalPlannedQueries);

    jest.spyOn(database, 'write').mockImplementation((...args) => {
      const result = databaseWrite(...args);
      if (++writeCount === 2) signalPostWrite();
      return result;
    });
    jest
      .spyOn(journalPlannedQueries, 'findOccurrenceJournals')
      .mockImplementation(async (...args) => {
        signalGeneration();
        await continueGeneration;
        return findOccurrenceJournals(...args);
      });

    const generation = generatePlannedOccurrence(WORKPLACE_ID, payment.id, occurrenceDate);
    await generationPaused;
    const posting = postPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, occurrenceDate);
    await postWriteStarted;
    releaseGeneration();

    await expect(generation).resolves.toMatchObject({ completed: true });
    await posting;

    const reloaded = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].status).toBe(JournalStatus.POSTED);
  }, 30000);

  it('rejects an occurrence that is already posted rather than posting twice', async () => {
    const payment = await createDuePayment();
    const occurrenceDate = payment.nextOccurrence;
    await journalPersistenceService.put(
      {
        journalDate: occurrenceDate,
        description: payment.name,
        currencyCode: payment.currencyCode,
        transactions: buildPlannedPaymentTransferLines(payment),
        status: JournalStatus.POSTED,
        plannedPaymentId: payment.id,
      },
      WORKPLACE_ID,
    );

    await expect(
      postPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, occurrenceDate),
    ).rejects.toThrow(/already has a journal/);
  }, 30000);

  it('skips a manual occurrence and advances its schedule in one batch', async () => {
    const payment = await createDuePayment();
    const expectedNextOccurrence = calculateNextOccurrence(payment.nextOccurrence, payment);
    const writeSpy = jest.spyOn(database, 'write');
    const batchSpy = jest.spyOn(database, 'batch');

    await skipPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, payment.nextOccurrence);

    const [journal] = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);
    expect(journal.status).toBe(JournalStatus.SKIPPED);
    expect(reloaded?.nextOccurrence).toBe(expectedNextOccurrence);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy).toHaveBeenCalledTimes(1);
  }, 30000);

  it('preserves the occurrence date and rejects a duplicate direct manual post', async () => {
    const payment = await createDuePayment();
    const occurrenceDate = normalizeToStartOfDay(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await database.write(async () => {
      await payment.update(record => {
        record.startDate = occurrenceDate;
        record.endDate = occurrenceDate;
        record.nextOccurrence = occurrenceDate;
      });
    });
    const writeSpy = jest.spyOn(database, 'write');
    const batchSpy = jest.spyOn(database, 'batch');

    await postPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, occurrenceDate);

    const [journal] = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const [metadata] = await database.collections
      .get<JournalMetadata>('journal_metadata')
      .query(Q.where('journal_id', journal.id))
      .fetch();
    const metadataJson = JSON.parse(metadata.metadataJson ?? '{}');
    expect(journal.status).toBe(JournalStatus.POSTED);
    expect(journal.journalDate).toBeGreaterThan(occurrenceDate + AppConfig.time.msPerDay);
    expect(metadataJson[MetadataKeys.ORIGINAL_PLANNED_DATE]).toBe(occurrenceDate);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy).toHaveBeenCalledTimes(1);

    await expect(
      postPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, occurrenceDate),
    ).rejects.toThrow(/already has a journal/);
    expect(batchSpy).toHaveBeenCalledTimes(1);
  }, 30000);

  it('does not post or advance the schedule when the planned journal is unbalanced', async () => {
    const payment = await createDuePayment();
    const journal = await journalPersistenceService.put(
      {
        journalDate: payment.nextOccurrence,
        description: payment.name,
        currencyCode: payment.currencyCode,
        transactions: buildPlannedPaymentTransferLines(payment),
        status: JournalStatus.PLANNED,
        plannedPaymentId: payment.id,
      },
      WORKPLACE_ID,
    );
    const [line] = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('journal_id', journal.id))
      .fetch();
    await database.write(async () => {
      await line.update(record => {
        record.amount += 1;
      });
    });

    await expect(
      postPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, payment.nextOccurrence),
    ).rejects.toThrow(/differ by/);

    const [reloadedJournal] = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloadedPayment = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);
    expect(reloadedJournal.status).toBe(JournalStatus.PLANNED);
    expect(reloadedPayment?.nextOccurrence).toBe(payment.nextOccurrence);
  }, 30000);

  it('single-flights concurrent due-processing runs per workplace', async () => {
    const payment = await createDuePayment();

    await Promise.all([
      processDuePlannedPayments(WORKPLACE_ID),
      processDuePlannedPayments(WORKPLACE_ID),
    ]);

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    expect(journals).toHaveLength(1);
  }, 30000);

  it('prevents concurrent writers from creating the same occurrence twice', async () => {
    const payment = await createDuePayment();
    const occurrenceDate = payment.nextOccurrence;

    const results = await Promise.allSettled([
      generatePlannedOccurrence(WORKPLACE_ID, payment.id, occurrenceDate),
      generatePlannedOccurrence(WORKPLACE_ID, payment.id, occurrenceDate),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);
    expect(journals).toHaveLength(1);
    expect(reloaded?.nextOccurrence).toBe(calculateNextOccurrence(occurrenceDate, payment));
  }, 30000);

  it('does not leave a journal or schedule advance when the batch fails', async () => {
    const payment = await createDuePayment();
    const updateSpy = jest
      .spyOn(plannedPaymentRepository, 'updateInSession')
      .mockImplementation(async () => {
        throw new Error('simulated schedule persistence failure');
      });

    await expect(
      generatePlannedOccurrence(WORKPLACE_ID, payment.id, payment.nextOccurrence),
    ).rejects.toThrow('simulated schedule persistence failure');

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);

    expect(journals).toHaveLength(0);
    expect(reloaded?.nextOccurrence).toBe(payment.nextOccurrence);

    updateSpy.mockRestore();
  }, 30000);

  it('does not commit when cancellation arrives at the writer commit boundary', async () => {
    const payment = await createDuePayment();
    const controller = new AbortController();
    const originalUpdateInSession =
      plannedPaymentRepository.updateInSession.bind(plannedPaymentRepository);
    const updateSpy = jest
      .spyOn(plannedPaymentRepository, 'updateInSession')
      .mockImplementation(async (...args) => {
        const result = await originalUpdateInSession(...args);
        controller.abort();
        return result;
      });

    await expect(
      generatePlannedOccurrence(
        WORKPLACE_ID,
        payment.id,
        payment.nextOccurrence,
        () => controller.signal.aborted,
      ),
    ).rejects.toThrow(/cancelled before commit/);

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);

    expect(journals).toHaveLength(0);
    expect(reloaded?.nextOccurrence).toBe(payment.nextOccurrence);
    updateSpy.mockRestore();
  }, 30000);

  it('does not commit when cancellation arrives at the real database writer', async () => {
    const payment = await createDuePayment();
    const controller = new AbortController();
    const originalWrite = database.write.bind(database);
    const writeSpy = jest.spyOn(database, 'write').mockImplementation(async work => {
      controller.abort();
      return originalWrite(work);
    });

    try {
      await expect(
        generatePlannedOccurrence(
          WORKPLACE_ID,
          payment.id,
          payment.nextOccurrence,
          () => controller.signal.aborted,
        ),
      ).rejects.toThrow(/cancelled before commit/);
    } finally {
      writeSpy.mockRestore();
    }

    const journalCount = await database.collections
      .get('journals')
      .query(Q.where('planned_payment_id', payment.id))
      .fetchCount();
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);

    expect(journalCount).toBe(0);
    expect(reloaded?.nextOccurrence).toBe(payment.nextOccurrence);
  }, 30000);

  it('keeps processing other payments when one schedule write conflicts', async () => {
    const conflicted = await createDuePayment('Gym');
    const healthy = await createDuePayment('Rent');
    const scheduledJournal = await journalPersistenceService.put(
      {
        journalDate: conflicted.nextOccurrence,
        description: conflicted.name,
        currencyCode: conflicted.currencyCode,
        transactions: buildPlannedPaymentTransferLines(conflicted),
        status: JournalStatus.PLANNED,
        plannedPaymentId: conflicted.id,
      },
      WORKPLACE_ID,
    );
    jest.spyOn(plannedPaymentRepository, 'findAllActive').mockResolvedValue([conflicted, healthy]);
    const originalUpdateInSession =
      plannedPaymentRepository.updateInSession.bind(plannedPaymentRepository);
    jest
      .spyOn(plannedPaymentRepository, 'updateInSession')
      .mockImplementation(async (session, workplaceId, id, updates, expected) => {
        if (id === conflicted.id) {
          throw new Error('Planned payment changed while its occurrence was being processed');
        }
        return originalUpdateInSession(session, workplaceId, id, updates, expected);
      });

    await expect(processDuePlannedPayments(WORKPLACE_ID)).resolves.toBeUndefined();

    const conflictedJournals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      conflicted.id,
    ]);
    const healthyJournals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      healthy.id,
    ]);
    const reloadedConflicted = await plannedPaymentRepository.find(WORKPLACE_ID, conflicted.id);
    const reloadedHealthy = await plannedPaymentRepository.find(WORKPLACE_ID, healthy.id);

    expect(conflictedJournals.map(journal => journal.id)).toEqual([scheduledJournal.id]);
    expect(reloadedConflicted?.status).toBe(PlannedPaymentStatus.ACTIVE);
    expect(reloadedConflicted?.nextOccurrence).toBe(conflicted.nextOccurrence);
    expect(healthyJournals).toHaveLength(1);
    expect(reloadedHealthy?.status).toBe(PlannedPaymentStatus.COMPLETED);
  }, 30000);

  it('treats an early-posted occurrence as settled and advances the schedule', async () => {
    const payment = await createDuePayment();
    const occurrenceDate = payment.nextOccurrence;
    const postedEarlyAt = occurrenceDate - 3 * AppConfig.time.msPerDay;
    await journalPersistenceService.put(
      {
        journalDate: postedEarlyAt,
        description: payment.name,
        currencyCode: payment.currencyCode,
        transactions: buildPlannedPaymentTransferLines(payment),
        status: JournalStatus.POSTED,
        plannedPaymentId: payment.id,
        metadata: {
          importSource: MetadataSources.MANUAL_POST,
          metadataJson: JSON.stringify({ [MetadataKeys.ORIGINAL_PLANNED_DATE]: occurrenceDate }),
        },
      },
      WORKPLACE_ID,
    );

    await processDuePlannedPayments(WORKPLACE_ID);

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);
    expect(journals).toHaveLength(1);
    expect(journals[0].journalDate).toBe(postedEarlyAt);
    expect(reloaded?.nextOccurrence).toBe(calculateNextOccurrence(occurrenceDate, payment));
    expect(reloaded?.status).toBe(PlannedPaymentStatus.COMPLETED);
  }, 30000);

  it('rejects posting an occurrence of a paused payment', async () => {
    const payment = await createDuePayment();
    const occurrenceDate = payment.nextOccurrence;
    await database.write(async () => {
      await payment.update(record => {
        record.status = PlannedPaymentStatus.PAUSED;
      });
    });

    await expect(
      postPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, occurrenceDate),
    ).rejects.toThrow(/not active/);

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);
    expect(journals).toHaveLength(0);
    expect(reloaded?.nextOccurrence).toBe(occurrenceDate);
  }, 30000);
});
