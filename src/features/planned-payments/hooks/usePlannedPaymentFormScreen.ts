import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { PlannedPaymentInterval } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import type { ScheduleValue } from '@/src/components/forms';
import { useAccounts } from '@/src/components/account-selection';
import { useCurrencies } from '@/src/hooks/use-currencies';
import type { PlannedPaymentFxMode } from '@/src/types/plannedPaymentFx';
import { formatRoundedAmount } from '@/src/utils/money';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { usePlannedPaymentFx } from './usePlannedPaymentFx';
import { usePlannedPaymentForm } from '@/src/features/planned-payments/hooks/usePlannedPaymentForm';
import { sortDestinationAccounts } from '@/src/features/planned-payments/helpers/sortDestinationAccounts';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function usePlannedPaymentFormScreen(id?: string) {
  const { workplaceId } = useWorkplace();
  const vm = usePlannedPaymentForm(workplaceId, id);
  const { accounts } = useAccounts(workplaceId);
  const { currencies } = useCurrencies();
  const [pickingAccountFor, setPickingAccountFor] = useState<'from' | 'to' | null>(null);
  const isEditMode = id !== undefined;
  const sourceAccount = accounts.find(account => account.id === vm.form.fromAccountId);
  const destinationAccount = accounts.find(account => account.id === vm.form.toAccountId);
  const destinationPrecision =
    currencies.find(currency => currency.code === destinationAccount?.currencyCode)?.precision ??
    CurrencyFormatter.getPrecisionFallback(destinationAccount?.currencyCode ?? '');
  const fx = usePlannedPaymentFx(vm.form, sourceAccount, destinationAccount, destinationPrecision);
  const [expansionPosition, setExpansionPosition] = useState<'left' | 'right' | null>(null);
  const { setForm } = vm;
  const { fxMode, destinationAmount } = vm.form;
  useEffect(() => {
    // Seed once when a quote arrives or after refresh. An explicitly cleared draft stays empty.
    const estimate = fx.pair.convertedAmount;
    if (fxMode === 'fixed' && destinationAmount === undefined && estimate != null) {
      setForm(current =>
        current.fxMode === 'fixed' && current.destinationAmount === undefined
          ? { ...current, destinationAmount: formatRoundedAmount(estimate, destinationPrecision) }
          : current,
      );
    }
  }, [fxMode, destinationAmount, setForm, fx.pair.convertedAmount, destinationPrecision]);
  const setFxMode = useCallback(
    (mode: PlannedPaymentFxMode) => {
      vm.setForm(current => {
        const currencyChanged = Boolean(
          sourceAccount && current.currencyCode !== sourceAccount.currencyCode,
        );
        return {
          ...current,
          fxMode: mode,
          currencyCode: sourceAccount?.currencyCode ?? current.currencyCode,
          amount: currencyChanged ? '' : current.amount,
          destinationAmount:
            mode === 'automatic' || currencyChanged
              ? undefined
              : (current.destinationAmount ??
                (fx.pair.convertedAmount != null
                  ? formatRoundedAmount(fx.pair.convertedAmount, destinationPrecision)
                  : undefined)),
          isAutoPost: mode === 'manual' ? false : current.isAutoPost,
        };
      });
    },
    [vm, sourceAccount, fx.pair.convertedAmount, destinationPrecision],
  );
  const schedule: ScheduleValue = {
    intervalType: vm.form.intervalType,
    intervalN: vm.form.intervalN,
    recurrenceDay: vm.form.recurrenceDay,
    recurrenceMonth: vm.form.recurrenceMonth,
  };

  const setSchedule = useCallback(
    (value: ScheduleValue) => {
      vm.setForm(current => ({
        ...current,
        intervalType: value.intervalType as PlannedPaymentInterval,
        intervalN: value.intervalN,
        recurrenceDay: value.recurrenceDay,
        recurrenceMonth: value.recurrenceMonth,
      }));
    },
    [vm],
  );

  const destinationAccounts = useMemo(() => sortDestinationAccounts(accounts), [accounts]);

  const swapAccounts = useCallback(() => {
    vm.setForm(current => {
      const nextSource = accounts.find(account => account.id === current.toAccountId);
      const currencyChanged = Boolean(
        nextSource && nextSource.currencyCode !== current.currencyCode,
      );
      return {
        ...current,
        fromAccountId: current.toAccountId,
        toAccountId: current.fromAccountId,
        currencyCode: nextSource?.currencyCode ?? current.currencyCode,
        amount: currencyChanged ? '' : current.amount,
        destinationAmount: undefined,
        fxMode:
          nextSource?.currencyCode ===
          accounts.find(account => account.id === current.fromAccountId)?.currencyCode
            ? 'automatic'
            : (current.fxMode ?? 'automatic'),
      };
    });
  }, [vm, accounts]);

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

  const selectAccount = useCallback(
    (role: 'from' | 'to', accountId: AccountId) => {
      vm.setForm(current => {
        if (accountId === (role === 'from' ? current.fromAccountId : current.toAccountId)) return current;
        const account = accounts.find(candidate => candidate.id === accountId);
        const opposite = accounts.find(
          candidate =>
            candidate.id === (role === 'from' ? current.toAccountId : current.fromAccountId),
        );
        const nextSource = role === 'from' ? account : opposite;
        const currencyCode = nextSource?.currencyCode ?? current.currencyCode;
        return {
          ...current,
          [role === 'from' ? 'fromAccountId' : 'toAccountId']: accountId,
          currencyCode,
          amount: currencyCode !== current.currencyCode ? '' : current.amount,
          destinationAmount: undefined,
          fxMode:
            account && opposite && account.currencyCode === opposite.currencyCode
              ? 'automatic'
              : (current.fxMode ?? 'automatic'),
        };
      });
      setPickingAccountFor(null);
      setExpansionPosition(null);
    },
    [vm, accounts],
  );
  const handleAccountSelect = useCallback(
    (accountId: AccountId) => {
      if (pickingAccountFor) selectAccount(pickingAccountFor, accountId);
    },
    [pickingAccountFor, selectAccount],
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
    sourceAccount,
    destinationAccount,
    destinationPrecision,
    fxPair: fx.pair,
    refreshFx: fx.refresh,
    setFxMode,
    expansionPosition,
    toggleAccountExpansion: (side: 'left' | 'right') => {
      setExpansionPosition(current => (current === side ? null : side));
      setPickingAccountFor(side === 'left' ? 'from' : 'to');
    },
    selectSource: (accountId: AccountId) => selectAccount('from', accountId),
    selectDestination: (accountId: AccountId) => selectAccount('to', accountId),
    form: vm.form,
    schedule,
    setSchedule,
    swapAccounts,
    autoFocusAmount: !isEditMode,
    isHydrated: vm.isHydrated,
    isValid: vm.isValid,
    requirementHint: vm.requirementHint,
    isSubmitting: vm.isSubmitting,
    leaveAfterSave: vm.leaveAfterSave,
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
