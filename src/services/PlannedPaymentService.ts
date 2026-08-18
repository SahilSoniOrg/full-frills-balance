import PlannedPayment, {
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/data/models/PlannedPayment';
import { generatePlannedJournalForPayment } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
import { togglePlannedPaymentStatus } from '@/src/services/planned-payment/plannedPaymentLifecycle';
import { preparePlannedPaymentMergeOperations } from '@/src/services/planned-payment/plannedPaymentMergeOperations';
import {
  postPlannedPaymentOccurrence,
  processDuePlannedPayments,
  skipPlannedPaymentOccurrence,
} from '@/src/services/planned-payment/plannedPaymentOrchestration';
import {
  createPlannedPayment,
  deletePlannedPayment,
  updatePlannedPayment,
} from '@/src/services/planned-payment/plannedPaymentCommands';
import { PlannedPaymentCommandInput } from '@/src/services/planned-payment/plannedPaymentCommandInputs';
import {
  calculateNextOccurrence as advancePlannedOccurrence,
  computeFirstOccurrence as computeFirstPlannedOccurrence,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { AccountId, PlannedPaymentId, WorkplaceId } from '@/src/types/domain';

/** Thin façade over planned-payment modules for hooks and existing call sites. */
export class PlannedPaymentService {
  calculateNextOccurrence(
    current: number,
    pp: {
      intervalN: number;
      intervalType: PlannedPaymentInterval;
      recurrenceDay?: number;
      recurrenceMonth?: number;
    },
  ): number {
    return advancePlannedOccurrence(current, pp);
  }

  computeFirstOccurrence(
    startDate: number,
    pp: {
      intervalN: number;
      intervalType: PlannedPaymentInterval;
      recurrenceDay?: number;
      recurrenceMonth?: number;
    },
  ): number {
    return computeFirstPlannedOccurrence(startDate, pp);
  }

  async generatePlannedJournal(pp: PlannedPayment, occurrenceDate: number): Promise<boolean> {
    return generatePlannedJournalForPayment(pp, occurrenceDate);
  }

  async postOccurrence(
    workplaceId: WorkplaceId,
    pp: PlannedPayment,
    occurrenceDate: number,
  ): Promise<void> {
    return postPlannedPaymentOccurrence(workplaceId, pp, occurrenceDate);
  }

  async skipOccurrence(
    workplaceId: WorkplaceId,
    pp: PlannedPayment,
    occurrenceDate: number,
  ): Promise<void> {
    return skipPlannedPaymentOccurrence(workplaceId, pp, occurrenceDate);
  }

  async processDuePayments(workplaceId: WorkplaceId, signal?: AbortSignal): Promise<void> {
    return processDuePlannedPayments(workplaceId, signal);
  }

  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<PlannedPayment[]> {
    return preparePlannedPaymentMergeOperations(workplaceId, sourceAccountIds, targetAccountId);
  }

  async toggleStatus(workplaceId: WorkplaceId, pp: PlannedPayment): Promise<PlannedPaymentStatus> {
    return togglePlannedPaymentStatus(workplaceId, pp);
  }

  async create(workplaceId: WorkplaceId, input: PlannedPaymentCommandInput) {
    return createPlannedPayment(workplaceId, input);
  }

  async update(workplaceId: WorkplaceId, id: PlannedPaymentId, input: PlannedPaymentCommandInput) {
    return updatePlannedPayment(workplaceId, id, input);
  }

  async delete(workplaceId: WorkplaceId, payment: PlannedPayment): Promise<void> {
    return deletePlannedPayment(workplaceId, payment);
  }
}

export const plannedPaymentService = new PlannedPaymentService();
