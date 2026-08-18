import { toPlainPlannedPayment } from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { map } from 'rxjs';

/** Read boundary for planned-payment feature consumers. */
export class PlannedPaymentReadService {
  observeAll(workplaceId: WorkplaceId) {
    return plannedPaymentRepository
      .observeAll(workplaceId)
      .pipe(map(items => items.map(toPlainPlannedPayment)));
  }

  observeActive(workplaceId: WorkplaceId) {
    return plannedPaymentRepository
      .observeActive(workplaceId)
      .pipe(map(items => items.map(toPlainPlannedPayment)));
  }

  observeById(workplaceId: WorkplaceId, plannedPaymentId: PlannedPaymentId) {
    return plannedPaymentRepository
      .observeById(workplaceId, plannedPaymentId)
      .pipe(map(item => (item ? toPlainPlannedPayment(item) : null)));
  }

  async find(workplaceId: WorkplaceId, plannedPaymentId: PlannedPaymentId) {
    return plannedPaymentRepository.find(workplaceId, plannedPaymentId);
  }
}

export const plannedPaymentReadService = new PlannedPaymentReadService();
