import PlannedPayment from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { assertAccountsExistInWorkplace } from '@/src/services/accounts/assertAccountsExist';
import { PlannedPaymentCommandInput } from '@/src/services/planned-payment/plannedPaymentCommandInputs';
import {
  buildCreatePersistenceInput,
  buildUpdatePersistenceInput,
} from '@/src/services/planned-payment/plannedPaymentSchedulePolicy';
import { processDuePlannedPayments } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';

export async function createPlannedPayment(
  workplaceId: WorkplaceId,
  input: PlannedPaymentCommandInput,
): Promise<PlannedPayment> {
  await assertAccountsExistInWorkplace(
    workplaceId,
    [input.fromAccountId, input.toAccountId],
    'Planned payment',
  );
  const persistence = buildCreatePersistenceInput(input);
  const created = await plannedPaymentRepository.create(workplaceId, persistence);
  await processDuePlannedPayments(workplaceId);
  return created;
}

export async function updatePlannedPayment(
  workplaceId: WorkplaceId,
  id: PlannedPaymentId,
  input: PlannedPaymentCommandInput,
): Promise<PlannedPayment> {
  const existing = await plannedPaymentRepository.find(workplaceId, id);
  if (!existing) {
    throw new Error('Planned payment not found');
  }

  await assertAccountsExistInWorkplace(
    workplaceId,
    [input.fromAccountId, input.toAccountId],
    'Planned payment',
  );
  const updates = buildUpdatePersistenceInput(existing, input);
  return plannedPaymentRepository.update(workplaceId, existing, updates);
}

export async function deletePlannedPayment(
  workplaceId: WorkplaceId,
  payment: PlannedPayment,
): Promise<void> {
  await plannedPaymentRepository.delete(workplaceId, payment);
}
