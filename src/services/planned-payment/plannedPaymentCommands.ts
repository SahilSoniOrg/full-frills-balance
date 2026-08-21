import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import Transaction from '@/src/data/models/Transaction';
import { persistBatch } from '@/src/data/repositories/persistBatch';
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
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { Model, Q } from '@nozbe/watermelondb';

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

async function prepareSoftDeleteJournalsAndTransactions(
  workplaceId: WorkplaceId,
  journals: Journal[],
): Promise<Model[]> {
  if (journals.length === 0) return [];
  const journalIds = journals.map(j => j.id);
  const transactions = await database.collections
    .get<Transaction>('transactions')
    .query(
      Q.where('workplace_id', workplaceId),
      Q.where('journal_id', Q.oneOf(journalIds)),
      Q.where('deleted_at', Q.eq(null)),
    )
    .fetch();

  const now = new Date();
  const journalOps = journals.map(j =>
    j.prepareUpdate(record => {
      record.deletedAt = now;
      record.updatedAt = now;
    }),
  );
  const txOps = transactions.map(t =>
    t.prepareUpdate(record => {
      record.deletedAt = now;
      record.updatedAt = now;
    }),
  );
  return [...journalOps, ...txOps];
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
  const journalOps = await prepareSoftDeleteJournalsAndTransactions(workplaceId, unpostedJournals);
  const ppOp = plannedPaymentRepository.prepareDelete(workplaceId, existing);

  await persistBatch([ppOp, ...journalOps]);
}
