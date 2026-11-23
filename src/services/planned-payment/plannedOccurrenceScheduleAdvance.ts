import type PlannedPayment from '@/src/data/models/PlannedPayment';
import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { calculateNextOccurrence } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { PlannedPaymentStatus } from '@/src/types/enums';
import type { PlannedOccurrenceSettlement } from './plannedOccurrenceSettlementTypes';

export async function advanceSchedule(
  session: AccountingWriteSession,
  payment: PlannedPayment,
  dayStart: number,
  correlationId: string,
): Promise<Omit<PlannedOccurrenceSettlement, 'journal'>> {
  const nextOccurrence = calculateNextOccurrence(dayStart, payment);
  if (payment.status !== PlannedPaymentStatus.ACTIVE || nextOccurrence <= payment.nextOccurrence) {
    return { nextOccurrence: payment.nextOccurrence, completed: false };
  }
  const completed = !!payment.endDate && nextOccurrence > payment.endDate;
  await plannedPaymentRepository.updateInSession(
    session,
    payment.workplaceId,
    payment.id,
    { nextOccurrence, ...(completed ? { status: PlannedPaymentStatus.COMPLETED } : {}) },
    { status: PlannedPaymentStatus.ACTIVE, nextOccurrence: payment.nextOccurrence },
    {
      eventType: completed ? 'planned_payment.completed' : 'planned_payment.schedule_advanced',
      source: 'system',
      correlationId,
      undoable: false,
    },
  );
  return { nextOccurrence, completed };
}
