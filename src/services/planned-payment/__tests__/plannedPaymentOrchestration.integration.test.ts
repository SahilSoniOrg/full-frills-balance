import { AppConfig } from '@/src/constants';
import { MetadataKeys } from '@/src/constants/ledger-constants';
import { database } from '@/src/data/database/Database';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { generatePlannedJournalForPayment } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
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

  async function createDuePayment(): Promise<PlannedPayment> {
    const occurrence = normalizeToStartOfDay(Date.now());
    return plannedPaymentRepository.create(WORKPLACE_ID, {
      name: 'Rent',
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
    const lookupSpy = jest.spyOn(journalPlannedQueries, 'findPlannedOnDay');

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
    expect(lookupSpy).not.toHaveBeenCalled();
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
    const assertAvailable = journalPersistenceRepository.assertPlannedOccurrenceAvailable.bind(
      journalPersistenceRepository,
    );

    jest.spyOn(database, 'write').mockImplementation((...args) => {
      const result = databaseWrite(...args);
      if (++writeCount === 2) signalPostWrite();
      return result;
    });
    jest
      .spyOn(journalPersistenceRepository, 'assertPlannedOccurrenceAvailable')
      .mockImplementation(async (...args) => {
        signalGeneration();
        await continueGeneration;
        return assertAvailable(...args);
      });

    const generation = generatePlannedJournalForPayment(payment, occurrenceDate);
    await generationPaused;
    const posting = postPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, occurrenceDate);
    await postWriteStarted;
    releaseGeneration();

    await expect(generation).resolves.toBe(true);
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

    const results = await Promise.all([
      generatePlannedJournalForPayment(payment, occurrenceDate),
      generatePlannedJournalForPayment(payment, occurrenceDate),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter(result => !result)).toHaveLength(1);
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

    await expect(generatePlannedJournalForPayment(payment, payment.nextOccurrence)).resolves.toBe(
      false,
    );

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

    const generated = await generatePlannedJournalForPayment(payment, payment.nextOccurrence, {
      signal: controller.signal,
    });

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);

    expect(generated).toBe(false);
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

    let generated = false;
    try {
      generated = await generatePlannedJournalForPayment(payment, payment.nextOccurrence, {
        signal: controller.signal,
      });
    } finally {
      writeSpy.mockRestore();
    }

    const journalCount = await database.collections
      .get('journals')
      .query(Q.where('planned_payment_id', payment.id))
      .fetchCount();
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);

    expect(generated).toBe(false);
    expect(journalCount).toBe(0);
    expect(reloaded?.nextOccurrence).toBe(payment.nextOccurrence);
  }, 30000);
});
