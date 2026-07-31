import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';

/** Read boundary for planned-payment feature consumers. */
export class PlannedPaymentReadService {
  observeAll(workplaceId: WorkplaceId) {
    return plannedPaymentRepository.observeAll(workplaceId);
  }

  observeById(workplaceId: WorkplaceId, plannedPaymentId: PlannedPaymentId) {
    return plannedPaymentRepository.observeById(workplaceId, plannedPaymentId);
  }

  async find(workplaceId: WorkplaceId, plannedPaymentId: PlannedPaymentId) {
    return plannedPaymentRepository.find(workplaceId, plannedPaymentId);
  }
}

export const plannedPaymentReadService = new PlannedPaymentReadService();
