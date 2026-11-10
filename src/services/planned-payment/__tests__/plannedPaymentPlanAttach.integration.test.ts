import { MetadataKeys } from '@/src/constants/ledger-constants';
import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { journalCaptureQueries } from '@/src/data/repositories/journal/JournalCaptureQueries';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import {
  readCaptureMetadata,
  withCaptureMetadata,
} from '@/src/domain/transaction-intelligence/captureMetadata';
import { registerAuditHandlers } from '@/src/services/audit-handlers';
import { revertEntry } from '@/src/services/audit-service';
import { attachCaptureJournalToPlannedOccurrence } from '@/src/services/planned-payment/plannedPaymentPlanAttach';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { resetDatabase } from '@/src/testing/resetDatabase';
import {
  AccountType,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionType,
} from '@/src/types/enums';
import { asPlannedPaymentId, type AccountId, type WorkplaceId } from '@/src/types/ids';
import { safeParseJSON } from '@/src/utils/serialization';
import { Q } from '@nozbe/watermelondb';

const WP = 'wp-plan-attach' as WorkplaceId;

registerAuditHandlers();

describe('planned payment plan attach', () => {
  let cashId: AccountId;
  let rentId: AccountId;
  let uncategorizedId: AccountId;
  let liabilityId: AccountId;
  const occurrenceDay = normalizeToStartOfDay(new Date(2026, 10, 10).getTime());

  beforeEach(async () => {
    await resetDatabase();
    cashId = (
      await accountWriteRepository.create({
        name: 'Checking',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId: WP,
      })
    ).id;
    rentId = (
      await accountWriteRepository.create({
        name: 'Rent',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        workplaceId: WP,
      })
    ).id;
    uncategorizedId = (
      await accountWriteRepository.create({
        name: 'Uncategorized Expense',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        workplaceId: WP,
      })
    ).id;
    liabilityId = (
      await accountWriteRepository.create({
        name: 'Credit card',
        accountType: AccountType.LIABILITY,
        currencyCode: 'USD',
        workplaceId: WP,
      })
    ).id;
  }, 15_000);

  async function createPlan(toAccountId: AccountId, name = 'Rent') {
    return plannedPaymentRepository.create(WP, {
      name,
      amount: 100,
      currencyCode: 'USD',
      fromAccountId: cashId,
      toAccountId,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.MONTHLY,
      startDate: occurrenceDay,
      nextOccurrence: occurrenceDay,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
    });
  }

  async function createPlannedJournal(plannedPaymentId: string, categoryAccountId = rentId) {
    const { journal } = await journalPersistenceRepository.put(
      {
        journalDate: occurrenceDay,
        description: 'Rent',
        currencyCode: 'USD',
        status: JournalStatus.PLANNED,
        plannedPaymentId: asPlannedPaymentId(plannedPaymentId),
        transactions: [
          { accountId: cashId, amount: 100, transactionType: TransactionType.CREDIT },
          { accountId: categoryAccountId, amount: 100, transactionType: TransactionType.DEBIT },
        ],
      },
      WP,
      { undoable: false },
    );
    return journal;
  }

  async function createCaptureJournal(options?: {
    categoryAccountId?: AccountId;
    origin?: 'uncategorized' | 'user' | 'default';
    description?: string;
    confirmedAt?: number;
  }) {
    const categoryAccountId = options?.categoryAccountId ?? uncategorizedId;
    const origin = options?.origin ?? 'uncategorized';
    const capture = withCaptureMetadata(undefined, {
      version: 1,
      merchant: 'Landlord',
      economicKind: 'expense',
      reviewState: 'needs_categorization',
      allocations: [
        {
          accountId: categoryAccountId,
          amount: 100,
          transactionType: TransactionType.DEBIT,
          currencyCode: 'USD',
          origin,
          confirmedAt: options?.confirmedAt,
        },
      ],
      uncategorizedAccountIds: [uncategorizedId],
      sources: [{ channel: 'sms', sourceId: 'sms-1', occurredAt: occurrenceDay + 3_600_000 }],
    });
    const { journal } = await journalPersistenceRepository.put(
      {
        journalDate: occurrenceDay + 3_600_000,
        description: options?.description ?? 'Landlord',
        currencyCode: 'USD',
        status: JournalStatus.POSTED,
        transactions: [
          { accountId: cashId, amount: 100, transactionType: TransactionType.CREDIT },
          { accountId: categoryAccountId, amount: 100, transactionType: TransactionType.DEBIT },
        ],
        metadata: { importSource: 'sms', metadataJson: capture },
      },
      WP,
      { source: 'system', undoable: false },
    );
    return journal;
  }

  async function metadataFor(journalId: string) {
    const [row] = await database.collections
      .get<JournalMetadata>('journal_metadata')
      .query(Q.where('journal_id', journalId), Q.where('workplace_id', WP))
      .fetch();
    return row;
  }

  it('upgrades Uncategorized, claims the occurrence, and retires the PLANNED journal', async () => {
    const payment = await createPlan(rentId);
    const planned = await createPlannedJournal(payment.id);
    const capture = await createCaptureJournal();

    const result = await attachCaptureJournalToPlannedOccurrence(WP, {
      captureJournalId: capture.id,
      plannedPaymentId: payment.id,
      plannedJournalId: planned.id,
      occurrenceDay,
    });

    expect(result.upgraded).toBe(true);
    expect(capture.plannedPaymentId).toBe(payment.id);
    expect(capture.description).toBe('Rent');

    const meta = await metadataFor(capture.id);
    const parsed = safeParseJSON<Record<string, unknown>>(meta.metadataJson, {});
    expect(parsed[MetadataKeys.ORIGINAL_PLANNED_DATE]).toBe(occurrenceDay);
    const captureMeta = readCaptureMetadata(meta.metadataJson);
    expect(captureMeta).toMatchObject({
      merchant: 'Landlord',
      reviewState: 'confirmed',
      sources: [{ sourceId: 'sms-1' }],
      allocations: [{ accountId: rentId, origin: 'system', confirmedAt: expect.any(Number) }],
    });

    const retired = await journalQueryRepository.findWithDeleted(WP, planned.id);
    expect(retired?.deletedAt).toBeTruthy();
    expect(
      await database.collections
        .get<Journal>('journals')
        .query(
          Q.where('planned_payment_id', payment.id),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('status', JournalStatus.PLANNED),
        )
        .fetchCount(),
    ).toBe(0);

    expect(await journalCaptureQueries.countNeedsCategorization(WP)).toBe(0);

    const logs = await auditRepository.findByEntity('journal', capture.id, WP);
    const attachLog = logs.find(log => log.eventType === 'journal.planned_payment_attached')!;
    expect(attachLog.canRevert).toBe(true);
    expect(attachLog.source).toBe('evidence_driven');
  });

  it('attaches without rewriting a user-categorized capture journal', async () => {
    const payment = await createPlan(rentId);
    const planned = await createPlannedJournal(payment.id);
    const capture = await createCaptureJournal({
      categoryAccountId: rentId,
      origin: 'user',
      confirmedAt: 42,
      description: 'My rent note',
    });

    const result = await attachCaptureJournalToPlannedOccurrence(WP, {
      captureJournalId: capture.id,
      plannedPaymentId: payment.id,
      plannedJournalId: planned.id,
      occurrenceDay,
    });

    expect(result.upgraded).toBe(false);
    expect(capture.description).toBe('My rent note');
    const captureMeta = readCaptureMetadata((await metadataFor(capture.id)).metadataJson);
    expect(captureMeta?.allocations).toEqual([
      expect.objectContaining({ accountId: rentId, origin: 'user', confirmedAt: 42 }),
    ]);
  });

  it('refuses structural conflicts unless confirmed, and never rewrites lines', async () => {
    const payment = await createPlan(liabilityId, 'Card payment');
    const planned = await journalPersistenceRepository.put(
      {
        journalDate: occurrenceDay,
        description: 'Card payment',
        currencyCode: 'USD',
        status: JournalStatus.PLANNED,
        plannedPaymentId: payment.id,
        transactions: [
          { accountId: cashId, amount: 100, transactionType: TransactionType.CREDIT },
          { accountId: liabilityId, amount: 100, transactionType: TransactionType.DEBIT },
        ],
      },
      WP,
      { undoable: false },
    );
    const capture = await createCaptureJournal();

    await expect(
      attachCaptureJournalToPlannedOccurrence(WP, {
        captureJournalId: capture.id,
        plannedPaymentId: payment.id,
        plannedJournalId: planned.journal.id,
        occurrenceDay,
      }),
    ).rejects.toThrow(/asset or liability/i);

    const result = await attachCaptureJournalToPlannedOccurrence(WP, {
      captureJournalId: capture.id,
      plannedPaymentId: payment.id,
      plannedJournalId: planned.journal.id,
      occurrenceDay,
      confirmStructuralConflict: true,
    });
    expect(result.upgraded).toBe(false);
    const captureMeta = readCaptureMetadata((await metadataFor(capture.id)).metadataJson);
    expect(captureMeta?.allocations[0].accountId).toBe(uncategorizedId);
  });

  it('undo restores link, lines, description, review, and the retired PLANNED journal', async () => {
    const payment = await createPlan(rentId);
    const planned = await createPlannedJournal(payment.id);
    const capture = await createCaptureJournal();

    await attachCaptureJournalToPlannedOccurrence(WP, {
      captureJournalId: capture.id,
      plannedPaymentId: payment.id,
      plannedJournalId: planned.id,
      occurrenceDay,
    });

    const attachLog = (await auditRepository.findByEntity('journal', capture.id, WP)).find(
      log => log.eventType === 'journal.planned_payment_attached',
    )!;
    const undo = await revertEntry(attachLog.id, WP);
    expect(undo).toEqual({ success: true });

    const restoredCapture = await journalQueryRepository.find(WP, capture.id);
    const restoredPlanned = await journalQueryRepository.find(WP, planned.id);
    expect(restoredCapture?.plannedPaymentId).toBeFalsy();
    expect(restoredCapture?.description).toBe('Landlord');
    expect(restoredPlanned?.deletedAt).toBeFalsy();
    expect(restoredPlanned?.status).toBe(JournalStatus.PLANNED);

    const captureMeta = readCaptureMetadata((await metadataFor(capture.id)).metadataJson);
    expect(captureMeta).toMatchObject({
      reviewState: 'needs_categorization',
      allocations: [{ accountId: uncategorizedId, origin: 'uncategorized' }],
      sources: [{ sourceId: 'sms-1' }],
    });
    const parsed = safeParseJSON<Record<string, unknown>>(
      (await metadataFor(capture.id)).metadataJson,
      {},
    );
    expect(parsed[MetadataKeys.ORIGINAL_PLANNED_DATE]).toBeUndefined();
  });
});
