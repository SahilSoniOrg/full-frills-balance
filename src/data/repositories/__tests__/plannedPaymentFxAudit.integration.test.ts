import { database } from '@/src/data/database/Database';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { registerAuditHandlers } from '@/src/services/audit-handlers';
import { revertEntry } from '@/src/services/audit-service';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { journalService } from '@/src/services/journal/journalDomainService';
import { PlannedPaymentFxReviewRequiredError } from '@/src/services/planned-payment/plannedPaymentFx';
import { postPlannedPaymentOccurrence } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import {
  AccountType,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import type { PlannedPaymentFxMode } from '@/src/types/plannedPaymentFx';

const WP = 'wp-fx-audit' as WorkplaceId;
registerAuditHandlers();

beforeEach(async () => {
  await database.write(() => database.unsafeResetDatabase());
});

async function createPayment() {
  const from = await accountWriteRepository.create({
    name: 'From',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId: WP,
  });
  const to = await accountWriteRepository.create({
    name: 'To',
    accountType: AccountType.ASSET,
    currencyCode: 'EUR',
    workplaceId: WP,
  });
  return plannedPaymentRepository.create(WP, {
    name: 'Transfer',
    amount: 100,
    currencyCode: 'INR',
    fromAccountId: from.id,
    toAccountId: to.id,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: 1000,
    nextOccurrence: 1000,
    status: PlannedPaymentStatus.ACTIVE,
    isAutoPost: false,
  });
}

it('records new FX fields and undo restores absent mode without rewriting legacy currency', async () => {
  const payment = await createPayment();
  await plannedPaymentRepository.updateSchedule(WP, payment, {
    fxMode: 'fixed',
    destinationAmount: 90,
  });
  const log = (await auditRepository.findByEntity('planned_payment', payment.id, WP)).find(
    entry => entry.eventType === 'planned_payment.updated',
  )!;
  expect(log.parsedChanges?.before).toMatchObject({ fxMode: null, destinationAmount: null });
  expect(log.parsedChanges?.after).toMatchObject({ fxMode: 'fixed', destinationAmount: 90 });
  expect(await revertEntry(log.id, WP)).toEqual({ success: true });
  expect(payment.fxMode).toBeNull();
  expect(payment.destinationAmount).toBeNull();
  expect(payment.currencyCode).toBe('INR');
});

it('undo restores a manual destination suggestion after automatic mode clears it', async () => {
  const payment = await createPayment();
  await plannedPaymentRepository.updateSchedule(WP, payment, {
    fxMode: 'manual',
    destinationAmount: 90,
  });
  await plannedPaymentRepository.updateSchedule(WP, payment, {
    fxMode: 'automatic',
    destinationAmount: undefined,
  });
  const log = (await auditRepository.findByEntity('planned_payment', payment.id, WP)).find(
    entry => entry.parsedChanges?.after?.fxMode === 'automatic',
  )!;
  expect(log.parsedChanges?.after).toMatchObject({ fxMode: 'automatic', destinationAmount: null });
  expect(await revertEntry(log.id, WP)).toEqual({ success: true });
  expect(payment.fxMode).toBe('manual');
  expect(payment.destinationAmount).toBe(90);
});

it('rejects stale FX undo after a subsequent destination amount edit', async () => {
  const payment = await createPayment();
  await plannedPaymentRepository.updateSchedule(WP, payment, {
    fxMode: 'fixed',
    destinationAmount: 90,
  });
  const log = (await auditRepository.findByEntity('planned_payment', payment.id, WP)).find(
    entry => entry.eventType === 'planned_payment.updated',
  )!;
  await plannedPaymentRepository.updateSchedule(WP, payment, { destinationAmount: 95 });
  expect((await revertEntry(log.id, WP)).success).toBe(false);
  expect(payment.fxMode).toBe('fixed');
  expect(payment.destinationAmount).toBe(95);
});

it('keeps different FX policies distinct when merging account references', async () => {
  const payment = await createPayment();
  await plannedPaymentRepository.updateSchedule(WP, payment, { fxMode: 'automatic' });
  const target = await accountWriteRepository.create({
    name: 'Merge target',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId: WP,
  });
  const duplicate = await plannedPaymentRepository.create(WP, {
    name: 'Transfer',
    amount: 100,
    currencyCode: 'INR',
    fromAccountId: target.id,
    toAccountId: payment.toAccountId,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: 1000,
    nextOccurrence: 1000,
    status: PlannedPaymentStatus.ACTIVE,
    isAutoPost: false,
    fxMode: 'fixed',
    destinationAmount: 90,
  });
  await runAccountingWriteSession(session =>
    plannedPaymentRepository.mergeAccountsInSession(
      session,
      WP,
      [payment.fromAccountId],
      target.id,
    ),
  );
  expect(payment.fromAccountId).toBe(target.id);
  expect(payment.status).toBe(PlannedPaymentStatus.ACTIVE);
  expect(duplicate.status).toBe(PlannedPaymentStatus.ACTIVE);
  expect(payment.fxMode).toBe('automatic');
  expect(duplicate.destinationAmount).toBe(90);
});

describe('posted planned-payment FX journal undo', () => {
  const workplace = 'audit-undo-planned-fx' as WorkplaceId;

  beforeEach(async () => {
    await database.write(() => database.unsafeResetDatabase());
    jest.spyOn(exchangeRateService, 'getRequiredRate').mockResolvedValue(0.9);
    jest.spyOn(exchangeRateService, 'getHistoricalRate');
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => rebuildQueueService.stop());

  async function postedOccurrence(mode: PlannedPaymentFxMode) {
    const source = await accountWriteRepository.create({
      name: 'USD source',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: workplace,
    });
    const destination = await accountWriteRepository.create({
      name: 'EUR destination',
      accountType: AccountType.ASSET,
      currencyCode: 'EUR',
      workplaceId: workplace,
    });
    const occurrenceDate = normalizeToStartOfDay(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const plan = await plannedPaymentRepository.create(workplace, {
      name: 'Historical transfer',
      amount: 100,
      currencyCode: 'USD',
      fxMode: mode,
      destinationAmount: mode === 'fixed' ? 87.23 : undefined,
      fromAccountId: source.id,
      toAccountId: destination.id,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.MONTHLY,
      startDate: occurrenceDate,
      nextOccurrence: occurrenceDate,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
    });
    if (mode === 'manual') {
      let required: PlannedPaymentFxReviewRequiredError | undefined;
      try {
        await postPlannedPaymentOccurrence(workplace, plan.id, occurrenceDate);
      } catch (error) {
        if (!(error instanceof PlannedPaymentFxReviewRequiredError)) throw error;
        required = error;
      }
      if (!required) throw new Error('Manual FX did not require occurrence review');
      await postPlannedPaymentOccurrence(workplace, plan.id, occurrenceDate, {
        ...required.request,
        sourceAmount: 125,
        destinationAmount: 91.23,
      });
    } else {
      await postPlannedPaymentOccurrence(workplace, plan.id, occurrenceDate);
    }
    const [journal] = await journalPlannedQueries.findByPlannedPaymentAndStatus(
      workplace,
      plan.id,
      JournalStatus.POSTED,
    );
    return { plan, journal };
  }

  async function nativeLines(
    journalId: Parameters<typeof transactionQueryRepository.findByJournal>[1],
  ) {
    return (await transactionQueryRepository.findByJournal(workplace, journalId)).map(line => ({
      id: line.id,
      accountId: line.accountId,
      amount: line.amount,
      currencyCode: line.currencyCode,
      exchangeRate: line.exchangeRate,
      transactionType: line.transactionType,
      transactionDate: line.transactionDate,
    }));
  }

  function disableMarketLookups() {
    jest
      .mocked(exchangeRateService.getRequiredRate)
      .mockClear()
      .mockRejectedValue(new Error('Market must not be consulted during audit undo'));
    jest
      .mocked(exchangeRateService.getHistoricalRate)
      .mockClear()
      .mockRejectedValue(new Error('Historical market must not be consulted during audit undo'));
  }

  test.each(['manual', 'fixed', 'automatic'] as const)(
    'undo reverting %s FX to planned restores recorded posting amounts, rates and date',
    async mode => {
      const { plan, journal } = await postedOccurrence(mode);
      const originalLines = await nativeLines(journal.id);
      const postedAt = journal.journalDate;
      const cursor = plan.nextOccurrence;
      await journalService.revertToPlanned(journal.id, workplace);
      const reversal = (await auditRepository.findByEntity('journal', journal.id, workplace)).find(
        log => log.eventType === 'journal.reverted_to_planned',
      )!;
      expect(journal.status).toBe(JournalStatus.PLANNED);
      disableMarketLookups();

      expect(await revertEntry(reversal.id, workplace)).toEqual({ success: true });
      expect(journal.status).toBe(JournalStatus.POSTED);
      expect(journal.journalDate).toBe(postedAt);
      expect(await nativeLines(journal.id)).toEqual(originalLines);
      expect(plan.nextOccurrence).toBe(cursor);
      expect(exchangeRateService.getRequiredRate).not.toHaveBeenCalled();
      expect(exchangeRateService.getHistoricalRate).not.toHaveBeenCalled();
      const restoration = (
        await auditRepository.findByEntity('journal', journal.id, workplace)
      ).find(
        log =>
          log.eventType === 'journal.posted' && log.parsedChanges?.revertsLogId === reversal.id,
      );
      expect(restoration).toBeDefined();
    },
  );

  test.each(['manual', 'fixed', 'automatic'] as const)(
    'undo deleting posted %s FX restores recorded native lines without market lookup',
    async mode => {
      const { plan, journal } = await postedOccurrence(mode);
      const originalLines = await nativeLines(journal.id);
      const postedAt = journal.journalDate;
      const cursor = plan.nextOccurrence;
      await journalService.deleteJournal(journal.id, workplace);
      const deletion = (await auditRepository.findByEntity('journal', journal.id, workplace)).find(
        log => log.eventType === 'journal.deleted',
      )!;
      expect(journal.deletedAt).toBeDefined();
      disableMarketLookups();

      expect(await revertEntry(deletion.id, workplace)).toEqual({ success: true });
      expect(journal.deletedAt).toBeNull();
      expect(journal.status).toBe(JournalStatus.POSTED);
      expect(journal.journalDate).toBe(postedAt);
      expect(await nativeLines(journal.id)).toEqual(originalLines);
      expect(plan.nextOccurrence).toBe(cursor);
      expect(exchangeRateService.getRequiredRate).not.toHaveBeenCalled();
      expect(exchangeRateService.getHistoricalRate).not.toHaveBeenCalled();
    },
  );
});
