import type PlannedPayment from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import { analytics } from '@/src/services/analytics';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import {
  PlannedPaymentCommandInput,
  normalizePlannedPaymentCommandInput,
} from '@/src/services/planned-payment/plannedPaymentCommandInputs';
import {
  buildCreatePersistenceInput,
  buildUpdatePersistenceInput,
  isPlannedPaymentScheduleChange,
} from '@/src/services/planned-payment/plannedPaymentSchedulePolicy';
import { processDuePlannedPayments } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { requirePlannedPayment } from '@/src/services/planned-payment/plannedPaymentWorkplace';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { isValidRepeatCount } from '@/src/utils/recurrenceLabels';

export async function createPlannedPayment(
  workplaceId: WorkplaceId,
  input: PlannedPaymentCommandInput,
): Promise<PlannedPayment> {
  if (!isValidRepeatCount(input.intervalN)) throw new Error('Enter a whole number from 1 to 9999.');
  const persistence = buildCreatePersistenceInput(input);
  const created = await plannedPaymentRepository.create(workplaceId, persistence, async () => {
    const accounts = await assertWritable(
      workplaceId,
      [input.fromAccountId, input.toAccountId],
      'Planned payment',
    );
    Object.assign(persistence, normalizePlannedPaymentCommandInput(input, accounts));
  });
  analytics.logPlannedPaymentCreated(created.intervalType, created.isAutoPost ? 'auto' : 'manual');
  await processDuePlannedPayments(workplaceId);
  return created;
}

export async function updatePlannedPayment(
  workplaceId: WorkplaceId,
  id: PlannedPaymentId,
  input: PlannedPaymentCommandInput,
): Promise<PlannedPayment> {
  if (!isValidRepeatCount(input.intervalN)) throw new Error('Enter a whole number from 1 to 9999.');
  const effectiveDate = normalizeToStartOfDay(Date.now());
  let schedulingChanged = false;
  const updated = await runAccountingWriteSession(async session => {
    const existing = await plannedPaymentRepository.find(workplaceId, id);
    if (!existing) throw new Error('Planned payment not found');
    const accounts = await assertWritable(
      workplaceId,
      [input.fromAccountId, input.toAccountId],
      'Planned payment',
    );
    const normalizedInput = normalizePlannedPaymentCommandInput(input, accounts, existing);
    schedulingChanged = isPlannedPaymentScheduleChange(existing, normalizedInput);
    const updates = buildUpdatePersistenceInput(existing, normalizedInput, effectiveDate);
    await plannedPaymentRepository.updateInSession(session, workplaceId, id, updates, undefined, {
      source: 'app',
      undoable: !schedulingChanged,
    });
    if (schedulingChanged) {
      await journalPersistenceRepository.deleteUnpostedByPlannedPaymentInSession(
        session,
        workplaceId,
        id,
        effectiveDate,
      );
    }
    return existing;
  });
  if (schedulingChanged) await processDuePlannedPayments(workplaceId);
  return updated;
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
  await requirePlannedPayment(workplaceId, plannedPaymentId);
  await journalPersistenceService.deletePlannedPayment(workplaceId, plannedPaymentId);
}
