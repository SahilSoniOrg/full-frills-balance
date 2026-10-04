import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  createEmptyPlannedPaymentForm,
  mapPlannedPaymentToForm,
  PlannedPaymentFormState,
  shouldSeedPlannedPaymentDraft,
} from '@/src/features/planned-payments/hooks/plannedPaymentFormDraft';
import { usePlannedPaymentRecord } from '@/src/features/planned-payments/hooks/usePlannedPaymentRecord';
import {
  createPlannedPayment,
  updatePlannedPayment,
} from '@/src/services/planned-payment/plannedPaymentCommands';
import { analytics } from '@/src/services/analytics';
import { WorkplaceId } from '@/src/types/ids';
import { formatRequirementHint } from '@/src/components/forms/requirementHint';
import { toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { isValidRepeatCount } from '@/src/utils/recurrenceLabels';
import dayjs from 'dayjs';
import { useCallback, useMemo, useRef, useState } from 'react';

export type { PlannedPaymentFormState };

/**
 * Planned payment create/edit form.
 * Draft is intentional local state, seeded once per `id` from observeById.
 * Later observe ticks never overwrite a dirty draft.
 */
export function usePlannedPaymentForm(workplaceId: WorkplaceId, id?: string) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leaveAfterSave, setLeaveAfterSave] = useState<(() => void) | null>(null);
  const isSubmittingRef = useRef(false);
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { item } = usePlannedPaymentRecord(workplaceId, id);

  const [seededId, setSeededId] = useState<string | null>(null);
  const [form, setForm] = useState<PlannedPaymentFormState>(() =>
    createEmptyPlannedPaymentForm(workplaceCurrency),
  );

  const canSeed = shouldSeedPlannedPaymentDraft({ id, seededId, item });
  if (canSeed && item) {
    setSeededId(id!);
    setForm(mapPlannedPaymentToForm(item));
  } else if (!id && seededId !== null) {
    setSeededId(null);
    setForm(createEmptyPlannedPaymentForm(workplaceCurrency));
  }

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (form.name.trim().length === 0) missing.push('a name');
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0)
      missing.push('an amount');
    if (
      form.fxMode === 'fixed' &&
      (!Number.isFinite(Number(form.destinationAmount)) || Number(form.destinationAmount) <= 0)
    )
      missing.push('a received amount');
    if (form.fromAccountId.length === 0) missing.push('a From account');
    if (form.toAccountId.length === 0) missing.push('a To account');
    if (form.fromAccountId.length > 0 && form.fromAccountId === form.toAccountId) missing.push('different From and To accounts');
    if (form.endDate != null && form.endDate < dayjs(form.startDate).startOf('day').valueOf()) {
      missing.push('an end date on or after the start date');
    }
    return missing;
  }, [
    form.name,
    form.amount,
    form.destinationAmount,
    form.fxMode,
    form.fromAccountId,
    form.toAccountId,
    form.startDate,
    form.endDate,
  ]);

  const isValid = missingFields.length === 0 && isValidRepeatCount(form.intervalN);
  const requirementHint = formatRequirementHint(missingFields);

  const handleSave = useCallback(async () => {
    if (!isValid || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const data = {
        name: form.name,
        description: form.description.trim() || undefined,
        amount: Number(form.amount),
        currencyCode: form.currencyCode,
        fxMode: form.fxMode,
        destinationAmount:
          form.fxMode !== 'automatic' && form.destinationAmount
            ? Number(form.destinationAmount)
            : undefined,
        fromAccountId: form.fromAccountId,
        toAccountId: form.toAccountId,
        intervalN: form.intervalN,
        intervalType: form.intervalType,
        startDate: form.startDate,
        endDate: form.endDate,
        isAutoPost: form.fxMode === 'manual' ? false : form.isAutoPost,
        recurrenceDay: form.recurrenceDay,
        recurrenceMonth: form.recurrenceMonth,
      };

      if (id) {
        if (item) {
          const schedulingChanged =
            item.startDate !== data.startDate ||
            item.intervalType !== data.intervalType ||
            item.intervalN !== data.intervalN;

          await updatePlannedPayment(workplaceId, item.id, data);

          analytics.trackFeatureUsage('planned_payment', 'update', {
            payment_id: id,
            scheduling_changed: schedulingChanged,
            interval_type: data.intervalType,
            is_auto_post: data.isAutoPost,
          });
        }
      } else {
        const newPayment = await createPlannedPayment(workplaceId, data);

        analytics.trackFeatureUsage('planned_payment', 'create', {
          payment_id: newPayment.id,
          amount: data.amount,
          currency: data.currencyCode,
          interval_type: data.intervalType,
          interval_n: data.intervalN,
          is_auto_post: data.isAutoPost,
        });
      }
      setLeaveAfterSave(() => AppNavigation.back);
    } catch (error) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      logger.error('Failed to save planned payment', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save planned payment');
    }
  }, [form, id, isValid, item, workplaceId]);

  return {
    form,
    isHydrated: !id || seededId === id,
    setForm,
    isValid,
    requirementHint,
    isSubmitting,
    leaveAfterSave,
    handleSave,
  };
}
