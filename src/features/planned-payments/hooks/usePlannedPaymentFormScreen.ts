import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { PlannedPaymentInterval } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import type { ScheduleValue } from '@/src/components/forms';
import { useAccounts } from '@/src/components/account-selection';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { usePlannedPaymentForm } from '@/src/features/planned-payments/hooks/usePlannedPaymentForm';
import { sortDestinationAccounts } from '@/src/features/planned-payments/helpers/sortDestinationAccounts';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo, useState } from 'react';

export function usePlannedPaymentFormScreen(id?: string) {
  const { workplaceId } = useWorkplace();
  const vm = usePlannedPaymentForm(workplaceId, id);
  const { accounts } = useAccounts(workplaceId);
  const { currencies } = useCurrencies();
  const [pickingAccountFor, setPickingAccountFor] = useState<'from' | 'to' | null>(null);
  const isEditMode = id !== undefined;
  const schedule: ScheduleValue = {
    intervalType: vm.form.intervalType,
    intervalN: vm.form.intervalN,
    recurrenceDay: vm.form.recurrenceDay,
    recurrenceMonth: vm.form.recurrenceMonth,
  };

  const setSchedule = useCallback((value: ScheduleValue) => {
    vm.setForm(current => ({
      ...current,
      intervalType: value.intervalType as PlannedPaymentInterval,
      intervalN: value.intervalN,
      recurrenceDay: value.recurrenceDay,
      recurrenceMonth: value.recurrenceMonth,
    }));
  }, [vm]);

  const destinationAccounts = useMemo(() => sortDestinationAccounts(accounts), [accounts]);

  const swapAccounts = useCallback(() => {
    vm.setForm(current => ({
      ...current,
      fromAccountId: current.toAccountId,
      toAccountId: current.fromAccountId,
    }));
  }, [vm]);

  const setField = useCallback(
    <K extends keyof typeof vm.form>(field: K, value: (typeof vm.form)[K]) => {
      vm.setForm(current => {
        const next = { ...current, [field]: value };
        const scheduleAnchorChanged =
          (field === 'intervalType' || field === 'startDate') && value !== current[field];
        if (!scheduleAnchorChanged) return next;
        const date = new Date(next.startDate);
        return {
          ...next,
          recurrenceDay:
            next.intervalType === PlannedPaymentInterval.DAILY
              ? undefined
              : next.intervalType === PlannedPaymentInterval.WEEKLY
                ? date.getDay()
                : date.getDate(),
          recurrenceMonth:
            next.intervalType === PlannedPaymentInterval.YEARLY ? date.getMonth() + 1 : undefined,
        };
      });
    },
    [vm],
  );

  const cycleIntervalType = useCallback(() => {
    const types = Object.values(PlannedPaymentInterval);
    const next = types[(types.indexOf(vm.form.intervalType) + 1) % types.length];
    const date = new Date(vm.form.startDate);

    vm.setForm(current => {
      const updates: Partial<typeof current> = { intervalType: next };

      if (next === PlannedPaymentInterval.WEEKLY) {
        updates.recurrenceDay = date.getDay();
        updates.recurrenceMonth = undefined;
      } else if (next === PlannedPaymentInterval.MONTHLY) {
        updates.recurrenceDay = date.getDate();
        updates.recurrenceMonth = undefined;
      } else if (next === PlannedPaymentInterval.YEARLY) {
        updates.recurrenceMonth = date.getMonth() + 1;
        updates.recurrenceDay = date.getDate();
      } else {
        updates.recurrenceDay = undefined;
        updates.recurrenceMonth = undefined;
      }

      return { ...current, ...updates };
    });
  }, [vm]);

  const setRecurrenceDayFromInput = useCallback(
    (value: string) => {
      if (value === '') {
        vm.setForm(current => ({ ...current, recurrenceDay: undefined }));
        return;
      }

      const day = parseInt(value, 10);
      if (!Number.isNaN(day) && day >= 1 && day <= 31) {
        vm.setForm(current => ({ ...current, recurrenceDay: day }));
      }
    },
    [vm],
  );

  const cycleRecurrenceMonth = useCallback(() => {
    vm.setForm(current => ({
      ...current,
      recurrenceMonth: ((current.recurrenceMonth || 1) % 12) + 1,
    }));
  }, [vm]);

  const handleAccountSelect = useCallback(
    (accountId: AccountId) => {
      if (pickingAccountFor === 'from') {
        vm.setForm(current => ({ ...current, fromAccountId: accountId }));
      } else if (pickingAccountFor === 'to') {
        vm.setForm(current => ({ ...current, toAccountId: accountId }));
      }
      setPickingAccountFor(null);
    },
    [pickingAccountFor, vm],
  );

  const pickerState = useMemo(
    () => ({
      visible: pickingAccountFor !== null,
      target: pickingAccountFor,
      accounts: pickingAccountFor === 'to' ? destinationAccounts : accounts,
      open: (target: 'from' | 'to') => setPickingAccountFor(target),
      close: () => setPickingAccountFor(null),
      selectedId: pickingAccountFor === 'from' ? vm.form.fromAccountId : vm.form.toAccountId,
      onSelect: handleAccountSelect,
    }),
    [
      accounts,
      destinationAccounts,
      pickingAccountFor,
      vm.form.fromAccountId,
      vm.form.toAccountId,
      handleAccountSelect,
    ],
  );

  return {
    accounts,
    currencies,
    form: vm.form,
    schedule,
    setSchedule,
    swapAccounts,
    autoFocusAmount: !isEditMode,
    isHydrated: vm.isHydrated,
    isValid: vm.isValid,
    requirementHint: vm.requirementHint,
    isSubmitting: vm.isSubmitting,
    handleSave: vm.handleSave,
    onBack: AppNavigation.back,
    setField,
    cycleIntervalType,
    setRecurrenceDayFromInput,
    cycleRecurrenceMonth,
    pickerState,
  };
}

export type PlannedPaymentFormScreenModel = ReturnType<typeof usePlannedPaymentFormScreen>;
