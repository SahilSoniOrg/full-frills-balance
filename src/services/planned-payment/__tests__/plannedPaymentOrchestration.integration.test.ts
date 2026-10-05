import { AppConfig } from '@/src/constants';
import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import { database } from '@/src/data/database/Database';
import {
  createDuePlannedPayment,
  seedPlannedPaymentWorkplace,
} from '@/src/testing/plannedPaymentFixtures';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction from '@/src/data/models/Transaction';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import {
  observePlannedPaymentObligations,
  type PlannedPaymentObligation,
} from '@/src/services/planned-payment/plannedPaymentReadService';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { observeWorkplaceAccounts } from '@/src/services/reactive/reactiveWorkplaceObserves';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { generatePlannedOccurrence } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
import {
  processDuePlannedPayments,
  postPlannedJournalOccurrence,
  postPlannedPaymentOccurrence,
  skipPlannedPaymentOccurrence,
} from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { buildPlannedPaymentTransferLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import { deletePlannedPayment } from '@/src/services/planned-payment/plannedPaymentCommands';
import { togglePlannedPaymentStatus } from '@/src/services/planned-payment/plannedPaymentLifecycle';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { JournalStatus, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { AccountId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import { firstValueFrom, ReplaySubject } from 'rxjs';
import { filter, map, skip, tap, timeout } from 'rxjs/operators';

const WORKPLACE_ID = 'wp-planned-atomic' as WorkplaceId;

function observePlannedObligations(workplaceId: WorkplaceId) {
  return observePlannedPaymentObligations(
    plannedPaymentRepository.observeAll(workplaceId),
    journalObserveQueries.observeAllPlanned(workplaceId),
    observeWorkplaceAccounts(workplaceId),
  );
}

describe('planned payment orchestration persistence', () => {
  let fromAccountId: AccountId;
  let toAccountId: AccountId;

  beforeEach(async () => {
    ({ fromAccountId, toAccountId } = await seedPlannedPaymentWorkplace(WORKPLACE_ID));
  }, 30000);

  afterAll(() => {
    rebuildQueueService.stop();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createDuePayment = (name = 'Rent') =>
    createDuePlannedPayment(WORKPLACE_ID, fromAccountId, toAccountId, { name });

  async function findJournalsForPayments(
    workplaceId: WorkplaceId,
    plannedPaymentIds: PlannedPaymentId[],
  ) {
    return database.collections
      .get<Journal>('journals')
      .query(
        Q.where('planned_payment_id', Q.oneOf(plannedPaymentIds)),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
  }

  it('creates the journal and advances nextOccurrence in one writer batch', async () => {
    const payment = await createDuePayment();
    const expectedNextOccurrence = calculateNextOccurrence(payment.nextOccurrence, payment);
    const writeSpy = jest.spyOn(database, 'write');
    const batchSpy = jest.spyOn(database, 'batch');

    await processDuePlannedPayments(WORKPLACE_ID);

    const journals = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);

    expect(journals).toHaveLength(1);
    expect(journals[0].status).toBe(JournalStatus.PLANNED);
    expect(reloaded?.nextOccurrence).toBe(expectedNextOccurrence);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy).toHaveBeenCalledTimes(1);
  }, 30000);

  it('projects and settles the generated unpaid occurrence before the advanced cursor', async () => {
    const payment = await createDuePayment('Finite rent');
    const originalOccurrence = payment.nextOccurrence;
    const projection$ = new ReplaySubject<PlannedPaymentObligation[]>(1);
    const projectionSubscription = observePlannedObligations(WORKPLACE_ID).subscribe(items =>
      projection$.next(items),
    );
    const initial = await firstValueFrom(
      projection$.pipe(
        map(items => items.find(item => item.id === payment.id)),
        filter(item => !!item),
        timeout({ first: 3000 }),
      ),
    );
    expect(initial?.nextDueOccurrence).toBe(originalOccurrence);
    const generatedProjection = firstValueFrom(
      projection$.pipe(
        skip(1),
        map(items => items.find(item => item.id === payment.id)),
        filter(item => !!item && item.outstandingJournalId !== undefined),
        timeout({ first: 3000 }),
      ),
    );
    await processDuePlannedPayments(WORKPLACE_ID);
    const [generated] = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
    expect(generated).toBeDefined();
    const projected = await generatedProjection;
    expect(projected?.nextDueOccurrence).toBe(originalOccurrence);
    expect(projected?.outstandingJournalId).toBe(generated.id);
    expect(projected?.nextOccurrence).toBeGreaterThan(originalOccurrence);

    const otherWorkplaceItems = await firstValueFrom(
      observePlannedObligations('wp-other' as WorkplaceId),
    );
    expect(otherWorkplaceItems).toEqual([]);
    const settledProjection = firstValueFrom(
      projection$.pipe(
        skip(1),
        map(items => items.find(item => item.id === payment.id)),
        filter(item => !!item && item.outstandingJournalId === undefined),
        timeout({ first: 3000 }),
      ),
    );

    await postPlannedJournalOccurrence(
      WORKPLACE_ID,
      payment.id,
      generated.id,
      projected!.nextDueOccurrence!,
    );
    const settled = await settledProjection;
    expect(settled?.outstandingJournalId).toBeUndefined();
    expect(settled?.nextDueOccurrence).toBeUndefined();
    projectionSubscription.unsubscribe();
  }, 30000);

  it('reactively drops a deleted planned journal and exposes the next active cursor', async () => {
    const occurrence = normalizeToStartOfDay(Date.now()) + AppConfig.time.msPerDay;
    const payment = await plannedPaymentRepository.create(WORKPLACE_ID, {
      name: 'Recurring rent',
      amount: 1200,
      currencyCode: 'USD',
      fromAccountId,
      toAccountId,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.DAILY,
      startDate: occurrence,
      nextOccurrence: occurrence,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
    });
    const projected$ = new ReplaySubject<PlannedPaymentObligation[]>(1);
    const subscription = observePlannedObligations(WORKPLACE_ID).subscribe(items =>
      projected$.next(items),
    );
    const initial = await firstValueFrom(
      projected$.pipe(
        map(items => items.find(item => item.id === payment.id)),
        filter(item => !!item),
        timeout({ first: 3000 }),
      ),
    );
    expect(initial?.nextDueOccurrence).toBe(occurrence);
    const generatedState = firstValueFrom(
      projected$.pipe(
        skip(1),
        map(items => items.find(item => item.id === payment.id)),
        filter(item => !!item && item.outstandingJournalId !== undefined),
        timeout({ first: 3000 }),
      ),
    );
    await generatePlannedOccurrence(WORKPLACE_ID, payment.id, occurrence);
    const withPending = await generatedState;
    expect(withPending?.nextDueOccurrence).toBe(occurrence);
    expect(withPending?.nextOccurrence).toBeGreaterThan(occurrence);
    if (!withPending?.outstandingJournalId) throw new Error('Expected a generated planned journal');
    const pendingJournalId = withPending.outstandingJournalId;

    const cursorAfterDelete = firstValueFrom(
      projected$.pipe(
        skip(1),
        map(items => items.find(item => item.id === payment.id)),
        filter(
          item =>
            !!item &&
            item.outstandingJournalId === undefined &&
            item.nextDueOccurrence === withPending.nextOccurrence,
        ),
        timeout({ first: 3000 }),
      ),
    );
    await database.write(async () => {
      const journal = await database.collections.get<Journal>('journals').find(pendingJournalId);
      await journal.update(record => {
        record.deletedAt = new Date();
      });
    });
    const afterDelete = await cursorAfterDelete;
    expect(afterDelete?.nextDueOccurrence).toBe(withPending.nextOccurrence);
    subscription.unsubscribe();
  }, 30000);

  it('keeps a finite future auto-post occurrence planned, then posts it once when due', async () => {
    const today = normalizeToStartOfDay(Date.now());
    const dueDate = today + AppConfig.time.msPerDay;
    let clock = Date.now();
    const dateNow = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const payment = await plannedPaymentRepository.create(WORKPLACE_ID, {
      name: 'Finite future rent',
      amount: 1200,
      currencyCode: 'USD',
      fromAccountId,
      toAccountId,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.DAILY,
      startDate: dueDate,
      endDate: dueDate,
      nextOccurrence: dueDate,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: true,
    });

    await processDuePlannedPayments(WORKPLACE_ID);
    let [journal] = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
    let reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);
    expect(journal.status).toBe(JournalStatus.PLANNED);
    expect(reloaded?.status).toBe(PlannedPaymentStatus.COMPLETED);
    expect(
      (
        await balanceReadService.getAccountBalances(WORKPLACE_ID, Date.now(), 'USD', undefined, [
          fromAccountId,
        ])
      )[0].balance,
    ).toBe(0);

    try {
      clock = dueDate + AppConfig.time.msPerDay;
      await processDuePlannedPayments(WORKPLACE_ID);
      [journal] = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
      expect(journal.status).toBe(JournalStatus.POSTED);
      expect(journal.journalDate).toBe(dueDate);
      await processDuePlannedPayments(WORKPLACE_ID);
      expect(await findJournalsForPayments(WORKPLACE_ID, [payment.id])).toHaveLength(1);
    } finally {
      dateNow.mockRestore();
    }
    await rebuildQueueService.flush();
    expect(
      (
        await balanceReadService.getAccountBalances(
          WORKPLACE_ID,
          dueDate + AppConfig.time.msPerDay,
          'USD',
          undefined,
          [fromAccountId],
        )
      )[0].balance,
    ).toBe(-1200);
  }, 30000);

  it('auto-posts an occurrence that is due today', async () => {
    const occurrence = normalizeToStartOfDay(Date.now());
    const payment = await plannedPaymentRepository.create(WORKPLACE_ID, {
      name: 'Due today',
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
      isAutoPost: true,
    });
    await processDuePlannedPayments(WORKPLACE_ID);
    const [journal] = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
    expect(journal.status).toBe(JournalStatus.POSTED);
    await rebuildQueueService.flush();
    expect(
      (
        await balanceReadService.getAccountBalances(WORKPLACE_ID, Date.now(), 'USD', undefined, [
          fromAccountId,
        ])
      )[0].balance,
    ).toBe(-1200);
  }, 30000);

  it('leaves a paused finite schedule occurrence untouched until the user resumes it', async () => {
    const today = normalizeToStartOfDay(Date.now());
    const dueDate = today + AppConfig.time.msPerDay;
    const payment = await plannedPaymentRepository.create(WORKPLACE_ID, {
      name: 'Paused finite future',
      amount: 1200,
      currencyCode: 'USD',
      fromAccountId,
      toAccountId,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.DAILY,
      startDate: dueDate,
      endDate: dueDate,
      nextOccurrence: dueDate,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: true,
    });
    const scheduled = await journalPersistenceService.put(
      {
        journalDate: dueDate,
        description: payment.name,
        currencyCode: payment.currencyCode,
        transactions: buildPlannedPaymentTransferLines(payment),
        status: JournalStatus.PLANNED,
        plannedPaymentId: payment.id,
      },
      WORKPLACE_ID,
    );
    await togglePlannedPaymentStatus(WORKPLACE_ID, payment.id);
    const pausedClock = jest.spyOn(Date, 'now').mockReturnValue(dueDate);
    try {
      await processDuePlannedPayments(WORKPLACE_ID);
      const stillPaused = await database.collections.get<Journal>('journals').find(scheduled.id);
      expect(stillPaused.status).toBe(JournalStatus.PAUSED);
      expect(
        (
          await balanceReadService.getAccountBalances(WORKPLACE_ID, dueDate, 'USD', undefined, [
            fromAccountId,
          ])
        )[0].balance,
      ).toBe(0);
      await togglePlannedPaymentStatus(WORKPLACE_ID, payment.id);
      const [resumed] = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
      expect(resumed.status).toBe(JournalStatus.POSTED);
      expect(await findJournalsForPayments(WORKPLACE_ID, [payment.id])).toHaveLength(1);
    } finally {
      pausedClock.mockRestore();
    }
  }, 30000);

  it('cancels a due auto-post after settlement staging but before its batch commits', async () => {
    const today = normalizeToStartOfDay(Date.now());
    const dueDate = today + AppConfig.time.msPerDay;
    const payment = await plannedPaymentRepository.create(WORKPLACE_ID, {
      name: 'Cancellation due',
      amount: 1200,
      currencyCode: 'USD',
      fromAccountId,
      toAccountId,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.DAILY,
      startDate: dueDate,
      endDate: dueDate,
      nextOccurrence: dueDate,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: true,
    });
    await processDuePlannedPayments(WORKPLACE_ID);
    const controller = new AbortController();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(dueDate + AppConfig.time.msPerDay);
    const findOccurrence = jest.spyOn(journalPlannedQueries, 'findOccurrenceJournals');
    const originalFind = findOccurrence.getMockImplementation()!;
    findOccurrence.mockImplementation(async (...args) => {
      const found = await originalFind(...args);
      controller.abort();
      return found;
    });
    try {
      await processDuePlannedPayments(WORKPLACE_ID, controller.signal);
    } finally {
      findOccurrence.mockRestore();
      clock.mockRestore();
    }
    const [journal] = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
    expect(journal.status).toBe(JournalStatus.PLANNED);
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

    const [journal] = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
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
    const [previousPostedJournal] = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
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

    const journals = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
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

    const reloaded = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
    const reloadedPayment = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].id).toBe(scheduledJournal.id);
    expect(reloaded[0].status).toBe(JournalStatus.POSTED);
    expect(reloadedPayment?.nextOccurrence).toBe(calculateNextOccurrence(occurrenceDate, payment));
    expect(lookupSpy).toHaveBeenCalledTimes(1);
  }, 30000);

  it('refreshes the planned-payment listing when posting advances its next occurrence', async () => {
    const payment = await createDuePayment();
    const occurrenceDate = payment.nextOccurrence;
    const expectedNextOccurrence = calculateNextOccurrence(occurrenceDate, payment);
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

    let markInitialEmission!: () => void;
    const initialEmission = new Promise<void>(resolve => {
      markInitialEmission = resolve;
    });
    const listedNextOccurrence = firstValueFrom(
      plannedPaymentRepository.observeAll(WORKPLACE_ID).pipe(
        tap(() => markInitialEmission()),
        skip(1),
        map(items => items.find(item => item.id === payment.id)?.nextOccurrence),
        timeout({ first: 2000 }),
      ),
    );

    await initialEmission;
    await postPlannedJournalOccurrence(
      WORKPLACE_ID,
      payment.id,
      scheduledJournal.id,
      occurrenceDate,
    );

    await expect(listedNextOccurrence).resolves.toBe(expectedNextOccurrence);
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

    const [reloaded] = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
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

    const reloaded = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
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

    const [journal] = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
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

    const [journal] = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
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

    const [reloadedJournal] = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
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

    const journals = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
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
    const journals = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
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

    const journals = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
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

    const journals = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
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

    const conflictedJournals = await findJournalsForPayments(WORKPLACE_ID, [conflicted.id]);
    const healthyJournals = await findJournalsForPayments(WORKPLACE_ID, [healthy.id]);
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

    const journals = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);
    expect(journals).toHaveLength(1);
    expect(journals[0].journalDate).toBe(postedEarlyAt);
    expect(reloaded?.nextOccurrence).toBe(calculateNextOccurrence(occurrenceDate, payment));
    expect(reloaded?.status).toBe(PlannedPaymentStatus.COMPLETED);
  }, 30000);

  it('rejects post and skip when the planned payment no longer exists', async () => {
    const payment = await createDuePayment();
    const occurrenceDate = payment.nextOccurrence;
    await deletePlannedPayment(WORKPLACE_ID, payment.id);
    await expect(
      postPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, occurrenceDate),
    ).rejects.toThrow('This planned payment was deleted.');
    await expect(
      skipPlannedPaymentOccurrence(WORKPLACE_ID, payment.id, occurrenceDate),
    ).rejects.toThrow('This planned payment was deleted.');
  });

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

    const journals = await findJournalsForPayments(WORKPLACE_ID, [payment.id]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);
    expect(journals).toHaveLength(0);
    expect(reloaded?.nextOccurrence).toBe(occurrenceDate);
  }, 30000);
});
