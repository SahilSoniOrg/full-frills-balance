import type PlannedPayment from '@/src/data/models/PlannedPayment';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import { analytics } from '@/src/services/analytics';
import { PlannedPaymentCommandInput } from '@/src/services/planned-payment/plannedPaymentCommandInputs';
import {
  buildCreatePersistenceInput,
  buildUpdatePersistenceInput,
} from '@/src/services/planned-payment/plannedPaymentSchedulePolicy';
import { processDuePlannedPayments } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';

export async function createPlannedPayment(
  workplaceId: WorkplaceId,
  input: PlannedPaymentCommandInput,
): Promise<PlannedPayment> {
  await assertWritable(workplaceId, [input.fromAccountId, input.toAccountId], 'Planned payment');
  const persistence = buildCreatePersistenceInput(input);
  const created = await plannedPaymentRepository.create(workplaceId, persistence);
  analytics.logPlannedPaymentCreated(input.intervalType, input.isAutoPost ? 'auto' : 'manual');
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

  await assertWritable(workplaceId, [input.fromAccountId, input.toAccountId], 'Planned payment');
  const updates = buildUpdatePersistenceInput(existing, input);
  return plannedPaymentRepository.update(workplaceId, existing, updates);
}

export async function upsertPlannedPaymentByName(
  workplaceId: WorkplaceId,
  input: PlannedPaymentCommandInput,
): Promise<void> {
  const existing = await plannedPaymentRepository.findAllActive(workplaceId);
  const match = existing.find(
    payment => payment.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
  );
  if (match) {
    await updatePlannedPayment(workplaceId, match.id, input);
    return;
  }
  await createPlannedPayment(workplaceId, input);
}

export async function deletePlannedPayment(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
): Promise<void> {
  const existing = await requirePlannedPayment(workplaceId, plannedPaymentId);

  const unpostedJournals = await journalPlannedQueries.findUnpostedByPlannedPayment(
    workplaceId,
    plannedPaymentId,
  );

  const transactions =
    unpostedJournals.length > 0
      ? await transactionQueryRepository.findByJournals(
          workplaceId,
          unpostedJournals.map(journal => journal.id),
        )
      : [];

  await persistBatch(() => {
    const ppOp = plannedPaymentRepository.prepareDelete(workplaceId, existing);
    const journalOps = journalPlannedQueries.prepareSoftDeleteUpdates(
      workplaceId,
      unpostedJournals,
      transactions,
    );
    return [ppOp, ...journalOps];
  });
}
