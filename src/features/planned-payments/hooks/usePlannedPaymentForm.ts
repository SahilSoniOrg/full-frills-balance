import { AppConfig } from '@/src/constants';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface PlannedPaymentFormState {
    name: string;
    amount: string;
    currencyCode: string;
    fromAccountId: string;
    toAccountId: string;
    intervalN: number;
    intervalType: PlannedPaymentInterval;
    startDate: number;
    endDate?: number;
    isAutoPost: boolean;
    recurrenceDay?: number;
    recurrenceMonth?: number;
}

export function usePlannedPaymentForm(id?: string) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [form, setForm] = useState<PlannedPaymentFormState>({
        name: '',
        amount: '',
        currencyCode: preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
        fromAccountId: '',
        toAccountId: '',
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        startDate: Date.now(),
        isAutoPost: false,
        recurrenceDay: new Date().getDate(),
        recurrenceMonth: undefined,
    });

    // Load initial values if editing
    useEffect(() => {
        if (id) {
            plannedPaymentRepository.find(id).then(pp => {
                if (pp) {
                    setForm({
                        name: pp.name,
                        amount: pp.amount.toString(),
                        currencyCode: pp.currencyCode,
                        fromAccountId: pp.fromAccountId,
                        toAccountId: pp.toAccountId || '',
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
    }, [id]);

    const isValid = useMemo(() => {
        return (
            form.name.trim().length > 0 &&
            form.amount.length > 0 && !isNaN(Number(form.amount)) &&
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
                const pp = await plannedPaymentRepository.find(id);
                if (pp) {
                    const schedulingChanged =
                        pp.startDate !== data.startDate ||
                        pp.intervalType !== data.intervalType ||
                        pp.intervalN !== data.intervalN;

                    await plannedPaymentRepository.update(pp, {
                        ...data,
                        nextOccurrence: schedulingChanged ? data.startDate : pp.nextOccurrence
                    });
                }
            } else {
                await plannedPaymentRepository.create({
                    ...data,
                    status: PlannedPaymentStatus.ACTIVE,
                    nextOccurrence: form.startDate,
                });
            }
            AppNavigation.back();
        } catch (error) {
            logger.error('Failed to save planned payment', error);
        } finally {
            setIsSubmitting(false);
        }
    }, [form, id, isValid]);

    return {
        form,
        setForm,
        isValid,
        isSubmitting,
        handleSave,
    };
}
