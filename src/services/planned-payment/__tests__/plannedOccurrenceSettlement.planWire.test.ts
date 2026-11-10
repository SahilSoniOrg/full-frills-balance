import { MetadataKeys } from '@/src/constants/ledger-constants';
import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { withCaptureMetadata } from '@/src/domain/transaction-intelligence/captureMetadata';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { settlePlannedOccurrence } from '@/src/services/planned-payment/plannedOccurrenceSettlement';
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

const WP = 'wp-plan-wire' as WorkplaceId;

describe('planned occurrence settlement plan wire', () => {
  let cashId: AccountId;
  let rentId: AccountId;
  let uncategorizedId: AccountId;
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
  }, 15_000);

  async function createPlan(overrides: { isAutoPost?: boolean; amount?: number } = {}) {
    return plannedPaymentRepository.create(WP, {
      name: 'Rent',
      amount: overrides.amount ?? 100,
      currencyCode: 'USD',
      fromAccountId: cashId,
      toAccountId: rentId,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.MONTHLY,
      startDate: occurrenceDay,
      nextOccurrence: occurrenceDay,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: overrides.isAutoPost ?? true,
    });
  }

  async function createPlannedJournal(plannedPaymentId: string) {
    const { journal } = await journalPersistenceRepository.put(
      {
        journalDate: occurrenceDay,
        description: 'Rent',
        currencyCode: 'USD',
        status: JournalStatus.PLANNED,
        plannedPaymentId: asPlannedPaymentId(plannedPaymentId),
        transactions: [
          { accountId: cashId, amount: 100, transactionType: TransactionType.CREDIT },
          { accountId: rentId, amount: 100, transactionType: TransactionType.DEBIT },
        ],
      },
      WP,
      { undoable: false },
    );
    return journal;
  }

  async function createCaptureJournal(options?: { amount?: number; journalDate?: number }) {
    const amount = options?.amount ?? 100;
    const capture = withCaptureMetadata(undefined, {
      version: 1,
      merchant: 'Landlord',
      economicKind: 'expense',
      reviewState: 'needs_categorization',
      allocations: [
        {
          accountId: uncategorizedId,
          amount,
          transactionType: TransactionType.DEBIT,
          currencyCode: 'USD',
          origin: 'uncategorized',
        },
      ],
      uncategorizedAccountIds: [uncategorizedId],
      sources: [{ channel: 'sms', sourceId: 'sms-wire-1', occurredAt: occurrenceDay }],
    });
    const { journal } = await journalPersistenceRepository.put(
      {
        journalDate: options?.journalDate ?? occurrenceDay,
        description: 'Landlord',
        currencyCode: 'USD',
        status: JournalStatus.POSTED,
        transactions: [
          { accountId: cashId, amount, transactionType: TransactionType.CREDIT },
          { accountId: uncategorizedId, amount, transactionType: TransactionType.DEBIT },
        ],
        metadata: { importSource: 'sms', metadataJson: capture },
      },
      WP,
      { source: 'system', undoable: false },
    );
    return journal;
  }

  it('strict unique capture attaches instead of auto-posting the PLANNED journal', async () => {
    const payment = await createPlan({ isAutoPost: true });
    const planned = await createPlannedJournal(payment.id);
    const capture = await createCaptureJournal();

    const settlement = await runAccountingWriteSession(session =>
      settlePlannedOccurrence(session, WP, payment.id, occurrenceDay, {
        kind: 'autoPostDue',
        asOf: occurrenceDay,
        journalId: planned.id,
      }),
    );
    journalPersistenceService.afterAtomicWriteCommit(
      settlement.journal ? [settlement.journal] : [],
      WP,
    );

    expect(settlement.journal?.journal.id).toBe(capture.id);
    expect(capture.plannedPaymentId).toBe(payment.id);

    const meta = (
      await database.collections
        .get<JournalMetadata>('journal_metadata')
        .query(Q.where('journal_id', capture.id), Q.where('workplace_id', WP))
        .fetch()
    )[0];
    const parsed = safeParseJSON<Record<string, unknown>>(meta.metadataJson, {});
    expect(parsed[MetadataKeys.ORIGINAL_PLANNED_DATE]).toBe(occurrenceDay);

    const retired = await database.collections.get<Journal>('journals').find(planned.id);
    expect(retired.deletedAt).toBeTruthy();
  }, 20_000);

  it('soft/ambiguous capture leaves the PLANNED journal untouched on auto-post', async () => {
    const payment = await createPlan({ isAutoPost: true });
    const planned = await createPlannedJournal(payment.id);
    // Soft amount (5%) within soft window.
    await createCaptureJournal({ amount: 104 });

    const settlement = await runAccountingWriteSession(session =>
      settlePlannedOccurrence(session, WP, payment.id, occurrenceDay, {
        kind: 'autoPostDue',
        asOf: occurrenceDay,
        journalId: planned.id,
      }),
    );

    expect(settlement.journal).toBeNull();
    const stillPlanned = await database.collections.get<Journal>('journals').find(planned.id);
    expect(stillPlanned.deletedAt).toBeNull();
    expect(stillPlanned.status).toBe(JournalStatus.PLANNED);
  }, 20_000);

  it('user post returns a structured attach candidate instead of silent-attaching', async () => {
    const payment = await createPlan({ isAutoPost: false });
    const planned = await createPlannedJournal(payment.id);
    const capture = await createCaptureJournal();

    const settlement = await runAccountingWriteSession(session =>
      settlePlannedOccurrence(session, WP, payment.id, occurrenceDay, {
        kind: 'post',
        postedAt: occurrenceDay,
        journalId: planned.id,
      }),
    );

    expect(settlement.journal).toBeNull();
    expect(settlement.attachCandidate).toEqual(
      expect.objectContaining({
        captureJournalId: capture.id,
        plannedJournalId: planned.id,
        matchKind: 'strict',
        occurrenceDay,
      }),
    );

    const stillPlanned = await database.collections.get<Journal>('journals').find(planned.id);
    expect(stillPlanned.deletedAt).toBeNull();
    expect(stillPlanned.status).toBe(JournalStatus.PLANNED);
    expect(capture.plannedPaymentId).toBeFalsy();
  }, 20_000);
});
