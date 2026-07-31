import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  createEmptyPlannedPaymentForm,
  mapPlannedPaymentToForm,
  PlannedPaymentFormState,
  shouldSeedPlannedPaymentDraft,
} from '@/src/features/planned-payments/hooks/plannedPaymentFormDraft';
import { usePlannedPaymentRecord } from '@/src/features/planned-payments/hooks/usePlannedPaymentRecord';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { analytics } from '@/src/services/analytics-service';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo, useState } from 'react';

export type { PlannedPaymentFormState };

/**
 * Planned payment create/edit form.
 * Draft is intentional local state, seeded once per `id` from observeById.
 * Later observe ticks never overwrite a dirty draft.
 */
export function usePlannedPaymentForm(workplaceId: WorkplaceId, id?: string) {
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const isValid = useMemo(() => {
    return (
      form.name.trim().length > 0 &&
      form.amount.length > 0 &&
      !isNaN(Number(form.amount)) &&
      form.fromAccountId.length > 0 &&
      form.toAccountId.length > 0 &&
      form.intervalN > 0
    );
  }, [form]);

  const handleSave = useCallback(async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    try {
      const data = {
        name: form.name,
        amount: Number(form.amount),
        currencyCode: form.currencyCode,
        fromAccountId: form.fromAccountId,
        toAccountId: form.toAccountId,
        intervalN: form.intervalN,
        intervalType: form.intervalType,
        startDate: form.startDate,
        endDate: form.endDate,
        isAutoPost: form.isAutoPost,
        recurrenceDay: form.recurrenceDay,
        recurrenceMonth: form.recurrenceMonth,
      };

      if (id) {
        if (item) {
          const schedulingChanged =
            item.startDate !== data.startDate ||
            item.intervalType !== data.intervalType ||
            item.intervalN !== data.intervalN;

          await plannedPaymentService.update(workplaceId, id as PlannedPaymentId, data);

          analytics.trackFeatureUsage('planned_payment', 'update', {
            payment_id: id,
            scheduling_changed: schedulingChanged,
            interval_type: data.intervalType,
            is_auto_post: data.isAutoPost,
          });
        }
      } else {
        const newPayment = await plannedPaymentService.create(workplaceId, data);

        analytics.trackFeatureUsage('planned_payment', 'create', {
          payment_id: newPayment.id,
          amount: data.amount,
          currency: data.currencyCode,
          interval_type: data.intervalType,
          interval_n: data.intervalN,
          is_auto_post: data.isAutoPost,
        });
      }
      AppNavigation.back();
    } catch (error) {
      logger.error('Failed to save planned payment', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [form, id, isValid, item, workplaceId]);

  return {
    form,
    setForm,
    isValid,
    isSubmitting,
    handleSave,
  };
}
