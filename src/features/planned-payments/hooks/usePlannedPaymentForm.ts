import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { computeFirstOccurrence } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { analytics } from '@/src/services/analytics-service';
import { AccountId, EMPTY_ACCOUNT_ID, PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface PlannedPaymentFormState {
  name: string;
  amount: string;
  currencyCode: string;
  fromAccountId: AccountId;
  toAccountId: AccountId;
  intervalN: number;
  intervalType: PlannedPaymentInterval;
  startDate: number;
  endDate?: number;
  isAutoPost: boolean;
  recurrenceDay?: number;
  recurrenceMonth?: number;
}

export function usePlannedPaymentForm(workplaceId: WorkplaceId, id?: string) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();

  const [form, setForm] = useState<PlannedPaymentFormState>(() => ({
    name: '',
    amount: '',
    currencyCode: workplaceCurrency,
    fromAccountId: EMPTY_ACCOUNT_ID,
    toAccountId: EMPTY_ACCOUNT_ID,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: Date.now(),
    isAutoPost: false,
    recurrenceDay: new Date().getDate(),
    recurrenceMonth: undefined,
  }));

  // Load initial values if editing
  useEffect(() => {
    if (id) {
      plannedPaymentRepository.find(workplaceId, id as PlannedPaymentId).then(pp => {
        if (pp) {
          setForm({
            name: pp.name,
            amount: pp.amount.toString(),
            currencyCode: pp.currencyCode,
            fromAccountId: pp.fromAccountId,
            toAccountId: pp.toAccountId || EMPTY_ACCOUNT_ID,
            intervalN: pp.intervalN,
            intervalType: pp.intervalType,
            startDate: pp.startDate,
            endDate: pp.endDate,
            isAutoPost: pp.isAutoPost,
            recurrenceDay: pp.recurrenceDay,
            recurrenceMonth: pp.recurrenceMonth,
          });
        }
      });
    }
  }, [id, workplaceId]);

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
        const pp = await plannedPaymentRepository.find(workplaceId, id as PlannedPaymentId);
        if (pp) {
          const schedulingChanged =
            pp.startDate !== data.startDate ||
            pp.intervalType !== data.intervalType ||
            pp.intervalN !== data.intervalN;

          await plannedPaymentRepository.update(workplaceId, pp, {
            ...data,
            nextOccurrence: schedulingChanged ? data.startDate : pp.nextOccurrence,
          });

          // Track Analytics
          analytics.trackFeatureUsage('planned_payment', 'update', {
            payment_id: id,
            scheduling_changed: schedulingChanged,
            interval_type: data.intervalType,
            is_auto_post: data.isAutoPost,
          });
        }
      } else {
        const firstOccurrence = computeFirstOccurrence(form.startDate, {
          intervalN: form.intervalN,
          intervalType: form.intervalType,
          recurrenceDay: form.recurrenceDay,
          recurrenceMonth: form.recurrenceMonth,
        });
        const newPayment = await plannedPaymentRepository.create(workplaceId, {
          ...data,
          status: PlannedPaymentStatus.ACTIVE,
          nextOccurrence: firstOccurrence,
        });
        // Bug 1 fix: immediately generate journals for the new planned payment
        // without requiring an app restart.
        await plannedPaymentService.processDuePayments(workplaceId);

        // Track Analytics
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
  }, [form, id, isValid, workplaceId]);

  return {
    form,
    setForm,
    isValid,
    isSubmitting,
    handleSave,
  };
}
