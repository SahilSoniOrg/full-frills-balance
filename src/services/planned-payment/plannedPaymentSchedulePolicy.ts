import PlannedPayment, { PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import { PlannedPaymentPersistenceInput } from '@/src/data/repositories/PlannedPaymentRepository';
import { computeFirstOccurrence } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { PlannedPaymentCommandInput } from '@/src/services/planned-payment/plannedPaymentCommandInputs';

export function isPlannedPaymentScheduleChange(
  existing: PlannedPayment,
  input: PlannedPaymentCommandInput,
): boolean {
  return (
    existing.startDate !== input.startDate ||
    existing.intervalType !== input.intervalType ||
    existing.intervalN !== input.intervalN
  );
}

export function buildCreatePersistenceInput(
  input: PlannedPaymentCommandInput,
): PlannedPaymentPersistenceInput {
  const nextOccurrence = computeFirstOccurrence(input.startDate, {
    intervalN: input.intervalN,
    intervalType: input.intervalType,
    recurrenceDay: input.recurrenceDay,
    recurrenceMonth: input.recurrenceMonth,
  });

  return {
    ...input,
    status: PlannedPaymentStatus.ACTIVE,
    nextOccurrence,
  };
}

export function buildUpdatePersistenceInput(
  existing: PlannedPayment,
  input: PlannedPaymentCommandInput,
): Partial<PlannedPaymentPersistenceInput> {
  const schedulingChanged = isPlannedPaymentScheduleChange(existing, input);

  return {
    ...input,
    nextOccurrence: schedulingChanged ? input.startDate : existing.nextOccurrence,
  };
}
