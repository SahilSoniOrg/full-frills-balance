import PlannedPayment from '@/src/data/models/PlannedPayment';
import { WorkplaceId } from '@/src/types/domain';

export function assertPlannedPaymentWorkplace(
  workplaceId: WorkplaceId,
  payment: PlannedPayment,
): void {
  if (payment.workplaceId !== workplaceId) {
    throw new Error('Planned payment not found or does not belong to the workplace');
  }
}
