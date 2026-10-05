import { useAccounts } from '@/src/components/account-selection';
import type { ScheduleValue } from '@/src/components/forms';
import { formatRequirementHint } from '@/src/components/forms/requirementHint';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  createEmptyPlannedPaymentForm,
  mapPlannedPaymentToForm,
  PlannedPaymentFormState,
  shouldSeedPlannedPaymentDraft,
} from '@/src/features/planned-payments/hooks/plannedPaymentFormDraft';
import { usePlannedPaymentFx } from '@/src/features/planned-payments/hooks/usePlannedPaymentFx';
import { usePlannedPaymentRecord } from '@/src/features/planned-payments/hooks/usePlannedPaymentRecord';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { analytics } from '@/src/services/analytics';
import {
  createPlannedPayment,
  updatePlannedPayment,
} from '@/src/services/planned-payment/plannedPaymentCommands';
import { AccountType, PlannedPaymentInterval } from '@/src/types/enums';
import type { PlannedPaymentFxMode } from '@/src/types/plannedPaymentFx';
import { AccountId } from '@/src/types/ids';
import type { PlainAccount } from '@/src/types/plainDtos';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { formatRoundedAmount } from '@/src/utils/money';
import { isValidRepeatCount } from '@/src/utils/recurrenceLabels';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type { PlannedPaymentFormState };

const destinationPriority: Partial<Record<AccountType, number>> = {
  [AccountType.EXPENSE]: 0,
  [AccountType.LIABILITY]: 1,
  [AccountType.ASSET]: 2,
};

function sortDestinationAccounts<T extends Pick<PlainAccount, 'accountType'>>(
  accounts: readonly T[],
): T[] {
  return accounts
    .map((account, index) => ({ account, index }))
    .sort((left, right) => {
      const leftPriority = destinationPriority[left.account.accountType] ?? 3;
      const rightPriority = destinationPriority[right.account.accountType] ?? 3;
      return leftPriority - rightPriority || left.index - right.index;
    })
    .map(({ account }) => account);
}

export function usePlannedPaymentForm(id?: string) {
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leaveAfterSave, setLeaveAfterSave] = useState<(() => void) | null>(null);
  const isSubmittingRef = useRef(false);
  const { item } = usePlannedPaymentRecord(workplaceId, id);
  const { accounts } = useAccounts(workplaceId);
  const { currencies } = useCurrencies();
  const [pickingAccountFor, setPickingAccountFor] = useState<'from' | 'to' | null>(null);
  const isEditMode = id !== undefined;
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

  const sourceAccount = accounts.find(account => account.id === form.fromAccountId);
  const destinationAccount = accounts.find(account => account.id === form.toAccountId);
  const destinationPrecision =
    currencies.find(currency => currency.code === destinationAccount?.currencyCode)?.precision ??
    CurrencyFormatter.getPrecisionFallback(destinationAccount?.currencyCode ?? '');
  const fx = usePlannedPaymentFx(form, sourceAccount, destinationAccount, destinationPrecision);
  const [expansionPosition, setExpansionPosition] = useState<'left' | 'right' | null>(null);
  const { fxMode, destinationAmount } = form;

  useEffect(() => {
    // Seed once when a quote arrives or after refresh. An explicitly cleared draft stays empty.
    const estimate = fx.pair.convertedAmount;
    if (fxMode === 'fixed' && destinationAmount === undefined && estimate != null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(current =>
        current.fxMode === 'fixed' && current.destinationAmount === undefined
          ? { ...current, destinationAmount: formatRoundedAmount(estimate, destinationPrecision) }
          : current,
      );
    }
  }, [fxMode, destinationAmount, fx.pair.convertedAmount, destinationPrecision]);

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
    if (form.fromAccountId.length > 0 && form.fromAccountId === form.toAccountId)
      missing.push('different From and To accounts');
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

  const setFxMode = useCallback(
    (mode: PlannedPaymentFxMode) => {
      setForm(current => {
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
    [sourceAccount, fx.pair.convertedAmount, destinationPrecision],
  );

  const schedule: ScheduleValue = {
    intervalType: form.intervalType,
    intervalN: form.intervalN,
    recurrenceDay: form.recurrenceDay,
    recurrenceMonth: form.recurrenceMonth,
  };

  const setSchedule = useCallback((value: ScheduleValue) => {
    setForm(current => ({
      ...current,
      intervalType: value.intervalType as PlannedPaymentInterval,
      intervalN: value.intervalN,
      recurrenceDay: value.recurrenceDay,
      recurrenceMonth: value.recurrenceMonth,
    }));
  }, []);

  const destinationAccounts = useMemo(() => sortDestinationAccounts(accounts), [accounts]);

  const swapAccounts = useCallback(() => {
    setForm(current => {
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
  }, [accounts]);

  const setField = useCallback(
    <K extends keyof PlannedPaymentFormState>(field: K, value: PlannedPaymentFormState[K]) => {
      setForm(current => {
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
    [],
  );

  const cycleIntervalType = useCallback(() => {
    const types = Object.values(PlannedPaymentInterval);
    const next = types[(types.indexOf(form.intervalType) + 1) % types.length];
    const date = new Date(form.startDate);

    setForm(current => {
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
  }, [form.intervalType, form.startDate]);

  const setRecurrenceDayFromInput = useCallback((value: string) => {
    if (value === '') {
      setForm(current => ({ ...current, recurrenceDay: undefined }));
      return;
    }

    const day = parseInt(value, 10);
    if (!Number.isNaN(day) && day >= 1 && day <= 31) {
      setForm(current => ({ ...current, recurrenceDay: day }));
    }
  }, []);

  const cycleRecurrenceMonth = useCallback(() => {
    setForm(current => ({
      ...current,
      recurrenceMonth: ((current.recurrenceMonth || 1) % 12) + 1,
    }));
  }, []);

  const selectAccount = useCallback(
    (role: 'from' | 'to', accountId: AccountId) => {
      setForm(current => {
        if (accountId === (role === 'from' ? current.fromAccountId : current.toAccountId))
          return current;
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
    [accounts],
  );

  const handleAccountSelect = useCallback(
    (accountId: AccountId) => {
      if (pickingAccountFor) selectAccount(pickingAccountFor, accountId);
    },
    [pickingAccountFor, selectAccount],
  );

  const pickerState = useMemo(
    () => ({
      target: pickingAccountFor,
      accounts: pickingAccountFor === 'to' ? destinationAccounts : accounts,
      open: (target: 'from' | 'to') => setPickingAccountFor(target),
      close: () => setPickingAccountFor(null),
      selectedId: pickingAccountFor === 'from' ? form.fromAccountId : form.toAccountId,
      onSelect: handleAccountSelect,
    }),
    [
      accounts,
      destinationAccounts,
      pickingAccountFor,
      form.fromAccountId,
      form.toAccountId,
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
    form,
    schedule,
    setSchedule,
    swapAccounts,
    autoFocusAmount: !isEditMode,
    isHydrated: !id || seededId === id,
    isValid,
    requirementHint,
    isSubmitting,
    leaveAfterSave,
    handleSave,
    onBack: AppNavigation.back,
    setField,
    cycleIntervalType,
    setRecurrenceDayFromInput,
    cycleRecurrenceMonth,
    pickerState,
  };
}

export type PlannedPaymentFormScreenModel = ReturnType<typeof usePlannedPaymentForm>;
