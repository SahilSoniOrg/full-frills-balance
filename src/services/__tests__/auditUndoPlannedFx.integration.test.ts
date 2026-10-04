import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
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
import type { WorkplaceId } from '@/src/types/ids';
import type { PlannedPaymentFxMode } from '@/src/types/plannedPaymentFx';

const WORKPLACE = 'audit-undo-planned-fx' as WorkplaceId;
registerAuditHandlers();

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
    workplaceId: WORKPLACE,
  });
  const destination = await accountWriteRepository.create({
    name: 'EUR destination',
    accountType: AccountType.ASSET,
    currencyCode: 'EUR',
    workplaceId: WORKPLACE,
  });
  const occurrenceDate = normalizeToStartOfDay(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const plan = await plannedPaymentRepository.create(WORKPLACE, {
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
      await postPlannedPaymentOccurrence(WORKPLACE, plan.id, occurrenceDate);
    } catch (error) {
      if (!(error instanceof PlannedPaymentFxReviewRequiredError)) throw error;
      required = error;
    }
    if (!required) throw new Error('Manual FX did not require occurrence review');
    await postPlannedPaymentOccurrence(WORKPLACE, plan.id, occurrenceDate, {
      ...required.request,
      sourceAmount: 125,
      destinationAmount: 91.23,
    });
  } else {
    await postPlannedPaymentOccurrence(WORKPLACE, plan.id, occurrenceDate);
  }
  const [journal] = await journalPlannedQueries.findByPlannedPaymentAndStatus(
    WORKPLACE,
    plan.id,
    JournalStatus.POSTED,
  );
  return { plan, journal };
}

async function nativeLines(
  journalId: Parameters<typeof transactionQueryRepository.findByJournal>[1],
) {
  return (await transactionQueryRepository.findByJournal(WORKPLACE, journalId)).map(line => ({
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
    await journalService.revertToPlanned(journal.id, WORKPLACE);
    const reversal = (await auditRepository.findByEntity('journal', journal.id, WORKPLACE)).find(
      log => log.eventType === 'journal.reverted_to_planned',
    )!;
    expect(journal.status).toBe(JournalStatus.PLANNED);
    disableMarketLookups();

    expect(await revertEntry(reversal.id, WORKPLACE)).toEqual({ success: true });
    expect(journal.status).toBe(JournalStatus.POSTED);
    expect(journal.journalDate).toBe(postedAt);
    expect(await nativeLines(journal.id)).toEqual(originalLines);
    expect(plan.nextOccurrence).toBe(cursor);
    expect(exchangeRateService.getRequiredRate).not.toHaveBeenCalled();
    expect(exchangeRateService.getHistoricalRate).not.toHaveBeenCalled();
    const restoration = (await auditRepository.findByEntity('journal', journal.id, WORKPLACE)).find(
      log => log.eventType === 'journal.posted' && log.parsedChanges?.revertsLogId === reversal.id,
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
    await journalService.deleteJournal(journal.id, WORKPLACE);
    const deletion = (await auditRepository.findByEntity('journal', journal.id, WORKPLACE)).find(
      log => log.eventType === 'journal.deleted',
    )!;
    expect(journal.deletedAt).toBeDefined();
    disableMarketLookups();

    expect(await revertEntry(deletion.id, WORKPLACE)).toEqual({ success: true });
    expect(journal.deletedAt).toBeNull();
    expect(journal.status).toBe(JournalStatus.POSTED);
    expect(journal.journalDate).toBe(postedAt);
    expect(await nativeLines(journal.id)).toEqual(originalLines);
    expect(plan.nextOccurrence).toBe(cursor);
    expect(exchangeRateService.getRequiredRate).not.toHaveBeenCalled();
    expect(exchangeRateService.getHistoricalRate).not.toHaveBeenCalled();
  },
);
