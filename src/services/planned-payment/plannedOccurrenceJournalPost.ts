import { MetadataKeys, MetadataSources } from '@/src/constants/ledger-constants';
import type PlannedPayment from '@/src/data/models/PlannedPayment';
import { assertExpectedJournalSnapshot } from '@/src/data/repositories/journal/journalAuditGuard';
import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/journalPersistenceTypes';
import Journal from '@/src/data/models/Journal';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { buildPlannedPaymentFxLines } from '@/src/services/planned-payment/plannedPaymentJournalLines';
import type { AuditEventMetadata } from '@/src/types/auditEvents';
import { JournalStatus } from '@/src/types/enums';
import {
  readPlannedPaymentFxContext,
  resolvePlannedPaymentFxAmounts,
  plannedPaymentFxMetadata,
  type PlannedPaymentFxReview,
  type PlannedPaymentFxQuote,
} from './plannedPaymentFx';

/** Patch and post in one put: staged puts are not visible to a subsequent status-only post. */
export async function postScheduledJournal(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  journal: Journal,
  occurrenceDate: number,
  postedAt: number,
  correlationId: string,
  source: 'system' | 'app',
  quote?: PlannedPaymentFxQuote,
  review?: PlannedPaymentFxReview,
  auditMetadata?: AuditEventMetadata,
  expectedCurrent?: Record<string, unknown>,
): Promise<JournalPersistenceResult> {
  const context = await readPlannedPaymentFxContext(payment, occurrenceDate, journal);
  if (!context)
    return journalPersistenceService.postInSession(
      session,
      journal.id,
      payment.workplaceId,
      postedAt,
      { source, correlationId },
    );
  if (expectedCurrent)
    assertExpectedJournalSnapshot(
      expectedCurrent,
      journal,
      await transactionQueryRepository.findByJournal(payment.workplaceId, journal.id),
    );
  const amounts = await resolvePlannedPaymentFxAmounts(context, {
    posting: true,
    postedAt,
    quote,
    review,
  });
  return journalPersistenceService.putInSession(
    session,
    {
      journalId: journal.id,
      journalDate: postedAt,
      status: JournalStatus.POSTED,
      transactions: buildPlannedPaymentFxLines(
        context.lines,
        context.review.sourceCurrency,
        context.review.destinationCurrency,
        amounts.sourceAmount,
        amounts.destinationAmount,
      ),
      metadata: {
        ...plannedPaymentFxMetadata(context, {
          [MetadataKeys.ORIGINAL_PLANNED_DATE]: journal.journalDate,
          fxPreviewRateUnavailable: false,
        }),
        importSource: MetadataSources.MANUAL_POST,
      },
    },
    payment.workplaceId,
    { eventType: 'journal.posted', source, correlationId, ...auditMetadata },
  );
}
