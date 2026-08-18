import PlannedPayment from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';

export function assertPlannedPaymentWorkplace(
  workplaceId: WorkplaceId,
  payment: PlannedPayment,
): void {
  if (payment.workplaceId !== workplaceId) {
    throw new Error('Planned payment not found or does not belong to the workplace');
  }
}

export async function requirePlannedPayment(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
): Promise<PlannedPayment> {
  const payment = await plannedPaymentRepository.find(workplaceId, plannedPaymentId);
  if (!payment) {
    throw new Error('This planned payment was deleted.');
  }
  assertPlannedPaymentWorkplace(workplaceId, payment);
  return payment;
}
