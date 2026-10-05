import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import {
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  AccountType,
} from '@/src/types/enums';
import { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import Transaction from '@/src/data/models/Transaction';
import { toPlainPlannedPayment } from '@/src/data/models/PlannedPayment';
// eslint-disable-next-line no-restricted-imports -- Regression exercises the requested DTO-to-form-to-command boundary.
import { mapPlannedPaymentToForm } from '@/src/features/planned-payments/hooks/plannedPaymentFormDraft';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import {
  createPlannedPayment,
  deletePlannedPayment,
  updatePlannedPayment,
} from '@/src/services/planned-payment/plannedPaymentCommands';
import { journalService } from '@/src/services/journal/journalDomainService';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { togglePlannedPaymentStatus } from '@/src/services/planned-payment/plannedPaymentLifecycle';
import { Q } from '@nozbe/watermelondb';
import { deleteAccount } from '@/src/services/accounts/accountDeleteCommands';
import { seedPlannedPaymentWorkplace } from '@/src/testing/plannedPaymentFixtures';

const WP = 'wp-pp-cmd' as WorkplaceId;

describe('planned payment commands (integration)', () => {
  let fromAccountId: AccountId;
  let toAccountId: AccountId;

  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 4, 12).getTime());
    ({ fromAccountId, toAccountId } = await seedPlannedPaymentWorkplace(WP));
  }, 15000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const baseInput = () => ({
    name: 'Monthly rent',
    amount: 1200,
    currencyCode: 'USD',
    fromAccountId,
    toAccountId,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: new Date(2026, 0, 15).getTime(),
    isAutoPost: false,
    recurrenceDay: 15,
  });

  async function findJournalsForPayment(plannedPaymentId: PlannedPaymentId) {
    return database.collections
      .get<Journal>('journals')
      .query(
        Q.where('planned_payment_id', plannedPaymentId),
        Q.where('workplace_id', WP),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
  }

  it('create persists payment, generates planned journals, and advances due processing', async () => {
    const created = await createPlannedPayment(WP, baseInput());

    expect(created.status).toBe(PlannedPaymentStatus.ACTIVE);
    expect(created.nextOccurrence).toBeGreaterThan(0);

    const reloaded = await plannedPaymentRepository.find(WP, created.id);
    expect(reloaded?.name).toBe('Monthly rent');

    const journals = await findJournalsForPayment(created.id);
    expect(journals.length).toBeGreaterThan(0);
    expect(journals.some(j => j.status === JournalStatus.PLANNED)).toBe(true);
  });

  it('leaves no payment, audit, journals, or analytics on publication failure', async () => {
    const batch = jest.spyOn(database, 'batch');
    batch.mockRejectedValueOnce(new Error('injected publication failure'));
    await expect(createPlannedPayment(WP, baseInput())).rejects.toThrow(
      'injected publication failure',
    );
    expect(await database.collections.get('planned_payments').query().fetchCount()).toBe(0);
    expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(0);
    expect(await database.collections.get('journals').query().fetchCount()).toBe(0);
  });

  it('publishes a direct repository create and its audit in one batch', async () => {
    const batch = jest.spyOn(database, 'batch');
    const created = await plannedPaymentRepository.create(WP, {
      ...baseInput(),
      nextOccurrence: baseInput().startDate,
      status: PlannedPaymentStatus.ACTIVE,
    });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(await plannedPaymentRepository.find(WP, created.id)).not.toBeNull();
    const logs = await auditRepository.findByEntity('planned_payment', created.id, WP);
    expect(logs).toHaveLength(1);
    expect(logs[0].eventType).toBe('planned_payment.created');
    expect(logs[0].source).toBe('app');
    expect(logs[0].canRevert).toBe(false);
    expect(logs[0].parsedChanges?.displayName).toBe('Monthly rent');
    expect(logs[0].correlationId).toBeFalsy();
    batch.mockRestore();
  });

  it.each(['funding', 'target'] as const)(
    'serializes planned-payment %s reference publication against account deletion',
    async accountRole => {
      const accountId = accountRole === 'funding' ? fromAccountId : toAccountId;
      let entered!: () => void;
      let release!: () => void;
      const enteredValidation = new Promise<void>(resolve => {
        entered = resolve;
      });
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      const originalCreate = plannedPaymentRepository.create.bind(plannedPaymentRepository);
      jest
        .spyOn(plannedPaymentRepository, 'create')
        .mockImplementation(async (workplaceId, data, validate) =>
          originalCreate(workplaceId, data, async () => {
            entered();
            await gate;
            await validate?.();
          }),
        );

      const creation = createPlannedPayment(WP, baseInput());
      await enteredValidation;
      const deletion = deleteAccount(accountId, WP);
      const deletionResult = expect(deletion).rejects.toThrow(/cannot be deleted while referenced/);
      release();
      const created = await creation;
      await deletionResult;
      expect(await plannedPaymentRepository.find(WP, created.id)).not.toBeNull();
    },
  );

  it.each(['funding', 'target'] as const)(
    'rejects planned-payment creation after %s account deletion wins',
    async accountRole => {
      const accountId = accountRole === 'funding' ? fromAccountId : toAccountId;
      await deleteAccount(accountId, WP);
      await expect(createPlannedPayment(WP, baseInput())).rejects.toThrow(
        /missing or deleted account/,
      );
      expect(await database.collections.get('planned_payments').query().fetchCount()).toBe(0);
    },
  );

  it('non-schedule update changes fields without resetting nextOccurrence', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const beforeNext = created.nextOccurrence;

    const updated = await updatePlannedPayment(WP, created.id, {
      ...baseInput(),
      name: 'Rent (updated)',
    });

    expect(updated.name).toBe('Rent (updated)');
    expect(updated.nextOccurrence).toBe(beforeNext);
  });

  it('keeps pending journal IDs and edited dates on a no-op native null DTO-to-form save', async () => {
    const created = await createPlannedPayment(WP, {
      ...baseInput(),
      name: 'Salary Deposit',
      intervalType: PlannedPaymentInterval.WEEKLY,
      intervalN: 2,
      startDate: new Date(2026, 8, 11).getTime(),
      recurrenceDay: 5,
    });
    // Native nullable columns return null even when the caller omitted them.
    expect(created.endDate).toBeNull();
    expect(created.recurrenceMonth).toBeNull();
    expect(created.fxMode).toBeNull();
    expect(created.destinationAmount).toBeNull();
    const today = new Date(2026, 9, 4).getTime();
    const pending = (await findJournalsForPayment(created.id))
      .filter(journal => journal.journalDate >= today)
      .sort((left, right) => left.journalDate - right.journalDate);
    expect(pending.map(journal => journal.journalDate)).toEqual([
      new Date(2026, 9, 9).getTime(),
      new Date(2026, 9, 23).getTime(),
    ]);
    await journalPersistenceService.put(
      {
        journalId: pending[0].id,
        journalDate: new Date(2026, 9, 5).getTime(),
      },
      WP,
    );
    const snapshot = (await findJournalsForPayment(created.id))
      .map(journal => ({ id: journal.id, date: journal.journalDate, status: journal.status }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const cursor = created.nextOccurrence;
    expect(cursor).toBe(new Date(2026, 10, 6).getTime());
    const linesBefore = await database.collections
      .get<Transaction>('transactions')
      .query(
        Q.where('journal_id', Q.oneOf(snapshot.map(journal => journal.id))),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    const lineIds = linesBefore.map(line => line.id).sort();

    const form = mapPlannedPaymentToForm(toPlainPlannedPayment(created));
    expect(form.endDate).toBeUndefined();
    expect(form.recurrenceMonth).toBeUndefined();
    expect(form.fxMode).toBeUndefined();
    expect(form.destinationAmount).toBeUndefined();
    const removeFuture = jest.spyOn(
      journalPersistenceRepository,
      'deleteUnpostedByPlannedPaymentInSession',
    );
    await updatePlannedPayment(WP, created.id, {
      ...form,
      description: form.description.trim() || undefined,
      amount: Number(form.amount),
      destinationAmount:
        form.fxMode !== 'automatic' && form.destinationAmount
          ? Number(form.destinationAmount)
          : undefined,
    });

    expect(removeFuture).not.toHaveBeenCalled();
    expect(created.nextOccurrence).toBe(cursor);
    expect(
      (await findJournalsForPayment(created.id))
        .map(journal => ({ id: journal.id, date: journal.journalDate, status: journal.status }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ).toEqual(snapshot);
    expect(pending.map(journal => journal.journalDate)).toEqual([
      new Date(2026, 9, 5).getTime(),
      new Date(2026, 9, 23).getTime(),
    ]);
    const linesAfter = await database.collections
      .get<Transaction>('transactions')
      .query(
        Q.where('journal_id', Q.oneOf(snapshot.map(journal => journal.id))),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    expect(linesAfter.map(line => line.id).sort()).toEqual(lineIds);
  });

  it('persists fixed FX native amounts and derives currency from the From account', async () => {
    const created = await createPlannedPayment(WP, {
      ...baseInput(),
      currencyCode: 'INR',
      fxMode: 'fixed',
      destinationAmount: 1200,
    });
    expect(toPlainPlannedPayment(created)).toMatchObject({
      fxMode: 'fixed',
      currencyCode: 'USD',
      amount: 1200,
      destinationAmount: 1200,
    });
    const logs = await auditRepository.findByEntity('planned_payment', created.id, WP);
    expect(
      logs.find(log => log.eventType === 'planned_payment.created')?.parsedChanges?.after,
    ).toMatchObject({ fxMode: 'fixed', destinationAmount: 1200 });
    const updated = await updatePlannedPayment(WP, created.id, { ...baseInput(), name: 'Renamed' });
    expect(updated.fxMode).toBe('fixed');
    expect(updated.destinationAmount).toBe(1200);
  });

  it('disables auto-post for manual FX and saves its destination suggestion', async () => {
    const created = await createPlannedPayment(WP, {
      ...baseInput(),
      fxMode: 'manual',
      isAutoPost: true,
      destinationAmount: 1200,
    });
    expect(created.isAutoPost).toBe(false);
    expect(created.destinationAmount).toBe(1200);
    const journals = await findJournalsForPayment(created.id);
    expect(journals.length).toBeGreaterThan(0);
    expect(journals.every(journal => journal.status === JournalStatus.PLANNED)).toBe(true);
  });

  it('rejects invalid fixed FX before publishing payment or audit', async () => {
    const foreignDestination = await accountWriteRepository.create({
      name: 'EUR destination',
      accountType: AccountType.ASSET,
      currencyCode: 'EUR',
      workplaceId: WP,
    });
    const beforeAuditCount = await auditRepository.countByWorkplace(WP);
    await expect(
      createPlannedPayment(WP, {
        ...baseInput(),
        toAccountId: foreignDestination.id,
        fxMode: 'fixed',
      }),
    ).rejects.toThrow(/positive destination amount/);
    expect(await database.collections.get('planned_payments').query().fetchCount()).toBe(0);
    expect(await auditRepository.countByWorkplace(WP)).toBe(beforeAuditCount);
  });

  it('rebuilds future unposted amounts while preserving history and posted entries', async () => {
    const input = {
      ...baseInput(),
      intervalType: PlannedPaymentInterval.WEEKLY,
      startDate: new Date(2026, 0, 5).getTime(),
      recurrenceDay: 1,
    };
    const created = await createPlannedPayment(WP, input);
    const before = await findJournalsForPayment(created.id);
    const today = new Date(2026, 9, 4).getTime();
    const historyIds = before
      .filter(journal => journal.journalDate < today)
      .map(journal => journal.id);
    const upcoming = before.filter(journal => journal.journalDate >= today);
    expect(upcoming.length).toBeGreaterThan(1);
    await database.write(async () => {
      await upcoming[0].update(journal => {
        journal.status = JournalStatus.POSTED;
      });
    });
    await updatePlannedPayment(WP, created.id, { ...input, amount: 1300 });
    const after = await findJournalsForPayment(created.id);
    expect(after.filter(journal => journal.journalDate < today).map(journal => journal.id)).toEqual(
      historyIds,
    );
    expect(after.find(journal => journal.id === upcoming[0].id)?.status).toBe(JournalStatus.POSTED);
    expect(after.some(journal => upcoming.slice(1).some(old => old.id === journal.id))).toBe(false);
    const regenerated = after.filter(
      journal => journal.journalDate >= today && journal.status === JournalStatus.PLANNED,
    );
    expect(regenerated.length).toBeGreaterThan(0);
    const lines = await database.collections
      .get<Transaction>('transactions')
      .query(
        Q.where('journal_id', Q.oneOf(regenerated.map(journal => journal.id))),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    expect(lines.every(line => line.amount === 1300)).toBe(true);
    const edit = (await auditRepository.findByEntity('planned_payment', created.id, WP)).find(
      log =>
        log.eventType === 'planned_payment.updated' && log.parsedChanges?.after?.amount === 1300,
    );
    expect(edit?.canRevert).toBe(false);
  });

  it('schedule-changing update rebuilds upcoming occurrences and preserves earlier entries', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const before = await findJournalsForPayment(created.id);
    const today = new Date(2026, 9, 4).getTime();
    const history = before.filter(j => j.journalDate < today);
    const oldUpcoming = before.filter(j => j.journalDate >= today);
    expect(oldUpcoming.length).toBeGreaterThan(0);
    const newStart = new Date(2026, 5, 15).getTime();

    const updated = await updatePlannedPayment(WP, created.id, {
      ...baseInput(),
      startDate: newStart,
      intervalN: 2,
    });

    expect(updated.nextOccurrence).toBeGreaterThan(today);
    expect(updated.intervalN).toBe(2);
    const after = await findJournalsForPayment(created.id);
    expect(after.filter(j => j.journalDate < today).map(j => j.id)).toEqual(history.map(j => j.id));
    expect(after.some(j => oldUpcoming.some(old => old.id === j.id))).toBe(false);
    const upcomingDates = after
      .filter(j => j.journalDate >= today)
      .map(j => new Date(j.journalDate));
    expect(upcomingDates.length).toBeGreaterThan(0);
    expect(upcomingDates.every(date => date.getDate() === 15 && date.getMonth() % 2 === 1)).toBe(
      true,
    );
  });

  it('keeps posted and skipped future entries when the count changes', async () => {
    const input = {
      ...baseInput(),
      intervalType: PlannedPaymentInterval.WEEKLY,
      startDate: new Date(2026, 0, 5).getTime(),
      recurrenceDay: 1,
    };
    const created = await createPlannedPayment(WP, input);
    const today = new Date(2026, 9, 4).getTime();
    const upcoming = (await findJournalsForPayment(created.id)).filter(j => j.journalDate >= today);
    expect(upcoming.length).toBeGreaterThanOrEqual(2);
    await database.write(async () => {
      await upcoming[0].update(j => {
        j.status = JournalStatus.POSTED;
      });
      await upcoming[1].update(j => {
        j.status = JournalStatus.SKIPPED;
      });
    });
    await updatePlannedPayment(WP, created.id, { ...input, intervalN: 3 });
    const after = await findJournalsForPayment(created.id);
    expect(after.find(j => j.id === upcoming[0].id)?.status).toBe(JournalStatus.POSTED);
    expect(after.find(j => j.id === upcoming[1].id)?.status).toBe(JournalStatus.SKIPPED);
  });

  it('leaves the count and future entries unchanged if reconciliation fails', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const before = (await findJournalsForPayment(created.id)).map(j => j.id);
    const cascade = journalPersistenceRepository.deleteUnpostedByPlannedPaymentInSession.bind(
      journalPersistenceRepository,
    );
    jest
      .spyOn(journalPersistenceRepository, 'deleteUnpostedByPlannedPaymentInSession')
      .mockImplementationOnce(async (...args) => {
        await cascade(...args);
        throw new Error('injected schedule failure');
      });
    await expect(
      updatePlannedPayment(WP, created.id, { ...baseInput(), intervalN: 7 }),
    ).rejects.toThrow('injected schedule failure');
    expect((await plannedPaymentRepository.find(WP, created.id))?.intervalN).toBe(1);
    expect((await findJournalsForPayment(created.id)).map(j => j.id)).toEqual(before);
  });

  it.each([0, -1, 1.5, Number.NaN, 10000])(
    'rejects invalid repeat counts before creating: %s',
    async count => {
      await expect(createPlannedPayment(WP, { ...baseInput(), intervalN: count })).rejects.toThrow(
        'Enter a whole number',
      );
      expect(await database.collections.get('planned_payments').query().fetchCount()).toBe(0);
    },
  );

  it('rejects a planned-payment replacement reference deleted before update', async () => {
    const replacement = await accountWriteRepository.create({
      name: 'Replacement rent',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const created = await createPlannedPayment(WP, baseInput());
    await deleteAccount(replacement.id, WP);
    await expect(
      updatePlannedPayment(WP, created.id, {
        ...baseInput(),
        toAccountId: replacement.id,
      }),
    ).rejects.toThrow(/missing or deleted account/);
    const reloaded = await plannedPaymentRepository.find(WP, created.id);
    expect(reloaded?.toAccountId).toBe(toAccountId);
  });

  it('delete soft-deletes active payment and cascades to unposted planned journals and transactions', async () => {
    const created = await createPlannedPayment(WP, baseInput());

    const journalsBefore = await findJournalsForPayment(created.id);
    expect(journalsBefore.length).toBeGreaterThan(0);
    const journalIds = journalsBefore.map(j => j.id);

    const txBefore = await database.collections
      .get<Transaction>('transactions')
      .query(
        Q.where('workplace_id', WP),
        Q.where('journal_id', Q.oneOf(journalIds)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    expect(txBefore.length).toBeGreaterThan(0);

    await deletePlannedPayment(WP, created.id);

    const gone = await plannedPaymentRepository.find(WP, created.id);
    expect(gone).toBeNull();

    const journalsAfter = await findJournalsForPayment(created.id);
    expect(journalsAfter.length).toBe(0);

    const txAfter = await database.collections
      .get<Transaction>('transactions')
      .query(
        Q.where('workplace_id', WP),
        Q.where('journal_id', Q.oneOf(journalIds)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    expect(txAfter.length).toBe(0);
  });

  it('delete preserves POSTED historical journals associated with the planned payment', async () => {
    const created = await createPlannedPayment(WP, baseInput());

    const plannedJournals = await findJournalsForPayment(created.id);
    expect(plannedJournals.length).toBeGreaterThan(0);

    // Simulate posting one of the journals
    const postedJournal = plannedJournals[0];
    await database.write(async () => {
      await postedJournal.update(record => {
        record.status = JournalStatus.POSTED;
      });
    });

    await deletePlannedPayment(WP, created.id);

    // POSTED journal still exists and is not soft deleted
    const reloaded = await database.collections.get<Journal>('journals').find(postedJournal.id);
    expect(reloaded.deletedAt).toBeFalsy();
    expect(reloaded.status).toBe(JournalStatus.POSTED);

    // Only the POSTED journal remains; all PLANNED journals are deleted
    const remaining = await findJournalsForPayment(created.id);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(postedJournal.id);
    expect(remaining[0].status).toBe(JournalStatus.POSTED);

    const remainingPlanned = await journalPlannedQueries.findByPlannedPaymentAndStatus(
      WP,
      created.id,
      JournalStatus.PLANNED,
    );
    expect(remainingPlanned.length).toBe(0);
  });

  it('refuses to revert a posted journal to scheduled after its planned payment is deleted', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const plannedJournals = await findJournalsForPayment(created.id);
    const postedJournal = plannedJournals[0];
    await database.write(async () => {
      await postedJournal.update(record => {
        record.status = JournalStatus.POSTED;
      });
    });

    await deletePlannedPayment(WP, created.id);

    await expect(journalService.revertToPlanned(postedJournal.id as JournalId, WP)).rejects.toThrow(
      /planned payment was deleted/,
    );

    const reloaded = await database.collections.get<Journal>('journals').find(postedJournal.id);
    expect(reloaded.status).toBe(JournalStatus.POSTED);
  });

  it('rejects toggle and delete when the planned payment is missing', async () => {
    const missing = 'pp-missing' as PlannedPaymentId;
    await expect(togglePlannedPaymentStatus(WP, missing)).rejects.toThrow(
      'This planned payment was deleted.',
    );
    await expect(deletePlannedPayment(WP, missing)).rejects.toThrow(
      'This planned payment was deleted.',
    );
  });

  it('propagates persistence failures during delete', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    jest
      .spyOn(journalPersistenceService, 'deletePlannedPayment')
      .mockRejectedValueOnce(new Error('atomic delete failed'));
    await expect(deletePlannedPayment(WP, created.id)).rejects.toThrow('atomic delete failed');
  });

  it('pause and resume go through service façade', async () => {
    const created = await createPlannedPayment(WP, baseInput());
    const writeSpy = jest.spyOn(database, 'write');
    const batchSpy = jest.spyOn(database, 'batch');

    const pausedStatus = await togglePlannedPaymentStatus(WP, created.id);
    expect(pausedStatus).toBe(PlannedPaymentStatus.PAUSED);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy).toHaveBeenCalledTimes(1);

    const paused = await plannedPaymentRepository.find(WP, created.id);
    expect(paused?.status).toBe(PlannedPaymentStatus.PAUSED);

    writeSpy.mockRestore();
    batchSpy.mockRestore();
    const resumedStatus = await togglePlannedPaymentStatus(WP, paused!.id);
    expect(resumedStatus).toBe(PlannedPaymentStatus.ACTIVE);
  });
});
