import PlannedPayment from '@/src/data/models/PlannedPayment';
import {
  PlannedPaymentPersistenceInput,
  PlannedPaymentScheduleUpdate,
} from '@/src/data/repositories/PlannedPaymentRepository';
import { computeFirstOccurrence } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { PlannedPaymentCommandInput } from '@/src/services/planned-payment/plannedPaymentCommandInputs';
import { PlannedPaymentStatus } from '@/src/types/enums';
import { RecurrenceEngine } from '@/src/services/forward-finance/recurrence/RecurrenceEngine';

export function isPlannedPaymentScheduleChange(
  existing: PlannedPayment,
  input: PlannedPaymentCommandInput,
): boolean {
  return (
    existing.startDate !== input.startDate ||
    existing.intervalType !== input.intervalType ||
    existing.intervalN !== input.intervalN ||
    (existing.recurrenceDay ?? undefined) !== input.recurrenceDay ||
    (existing.recurrenceMonth ?? undefined) !== input.recurrenceMonth
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
  effectiveDate: number = Date.now(),
): PlannedPaymentScheduleUpdate {
  const schedulingChanged = isPlannedPaymentScheduleChange(existing, input);

  return {
    ...input,
    ...(schedulingChanged
      ? {
          nextOccurrence: RecurrenceEngine.getOccurrenceOnOrAfter(
            input.startDate,
            {
              intervalN: input.intervalN,
              intervalType: input.intervalType,
              recurrenceDay: input.recurrenceDay,
              recurrenceMonth: input.recurrenceMonth,
            },
            effectiveDate,
          ),
        }
      : {}),
  };
}
