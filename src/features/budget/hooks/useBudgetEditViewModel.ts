import { formatRequirementHint } from '@/src/components/forms/requirementHint';
import type { ScheduleValue } from '@/src/components/forms';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AccountType } from '@/src/types/enums';
import { AccountId, BudgetId } from '@/src/types/ids';
import { PlainBudget, PlainBudgetScope } from '@/src/types/plainDtos';

import {
  BudgetEditDraft,
  calculateAverageSpend,
  createEmptyBudgetDraft,
  formatBudgetAmountLabel,
  mapBudgetToEditDraft,
} from '@/src/features/budget/hooks/budgetEditDraft';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { budgetFormStrings } from '@/src/constants/copy/domains/budgetFormStrings';
import { isLiquidAssetSubtype } from '@/src/domain/accounts/accountSubtypes';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { roundToPrecision } from '@/src/domain/money/money';
import { useBoundWorkplaceSaveGate } from '@/src/navigation/boundWorkplace';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { isValidRepeatCount } from '@/src/domain/planned-payment/recurrenceRules';
import type { BudgetSpendingHistoryEntry } from '@/src/services/budget/budgetReadService';
import dayjs from 'dayjs';
import { type SetStateAction, useCallback, useMemo, useRef, useState } from 'react';
import { of } from 'rxjs';

export type BudgetEditRouteParams = {
  id?: BudgetId;
  pName?: string;
  pAmount?: string;
  pCurrency?: string;
  workplaceId?: string;
};

/**
 * Budget create/edit form.
 * Draft fields are intentional local state, seeded once per `budgetId` from
 * observeById + observeScopes. Later observe ticks never overwrite a dirty draft.
 */
export function useBudgetEditViewModel(params: BudgetEditRouteParams) {
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { workplaceId, assertBound } = useBoundWorkplaceSaveGate();
  const budgetId = params.id;

  const { data: expenseAccounts = [] } = useObservable(
    () => accountQueries.observeByType(workplaceId, AccountType.EXPENSE),
    [workplaceId],
    [],
    { keepPreviousData: false, resetKey: workplaceId },
  );
  const { data: assetAccounts = [] } = useObservable(
    () => accountQueries.observeByType(workplaceId, AccountType.ASSET),
    [workplaceId],
    [],
    { keepPreviousData: false, resetKey: workplaceId },
  );
  const liquidAssetAccounts = assetAccounts.filter(a => isLiquidAssetSubtype(a.accountSubtype));

  const { currencies } = useCurrencies();

  const pName = params.pName || '';
  const pAmount = params.pAmount || '';
  const pCurrency = params.pCurrency || workplaceCurrency;
  const entityResetKey = `${workplaceId}:${budgetId ?? ''}`;

  const { data: observedBudget, isLoading: budgetLoading } = useObservable<PlainBudget | null>(
    () => (budgetId ? budgetReadService.observeById(workplaceId, budgetId) : of(null)),
    [workplaceId, budgetId],
    null,
    { keepPreviousData: false, resetKey: entityResetKey },
  );

  const { data: scopes = [], isLoading: scopesLoading } = useObservable<PlainBudgetScope[]>(
    () => (budgetId ? budgetReadService.observeScopes(workplaceId, budgetId) : of([])),
    [workplaceId, budgetId],
    [],
    { keepPreviousData: false, resetKey: entityResetKey },
  );

  const scopesReady = !budgetId || !scopesLoading;
  const isSeededEntity = Boolean(
    budgetId && observedBudget && scopesReady && observedBudget.id === budgetId,
  );
  const seededDraft = useMemo(
    () =>
      budgetId && observedBudget && scopesReady && observedBudget.id === budgetId
        ? mapBudgetToEditDraft(observedBudget, scopes, workplaceCurrency)
        : createEmptyBudgetDraft({ name: pName, amount: pAmount, currencyCode: pCurrency }),
    [budgetId, observedBudget, pAmount, pCurrency, pName, scopes, scopesReady, workplaceCurrency],
  );

  const [draftState, setDraftState] = useState<{
    key: string;
    draft: BudgetEditDraft;
  } | null>(null);
  const draft = draftState?.key === entityResetKey ? draftState.draft : seededDraft;
  const setDraft = useCallback(
    (updater: SetStateAction<BudgetEditDraft>) => {
      setDraftState(current => {
        const base = current?.key === entityResetKey ? current.draft : seededDraft;
        return {
          key: entityResetKey,
          draft: typeof updater === 'function' ? updater(base) : updater,
        };
      });
    },
    [entityResetKey, seededDraft],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [leaveAfterSave, setLeaveAfterSave] = useState<(() => void) | null>(null);
  const isSubmittingRef = useRef(false);

  const selectedAccountIds = draft.selectedAccountIds;
  const selectedIds = useMemo(() => new Set(selectedAccountIds), [selectedAccountIds]);
  const selectedCategories = useMemo(
    () => expenseAccounts.filter(account => selectedIds.has(account.id)),
    [expenseAccounts, selectedIds],
  );
  const categorySuggestions = useMemo(
    () =>
      expenseAccounts
        .filter(account => !account.parentAccountId && !selectedIds.has(account.id))
        .slice(0, 4),
    [expenseAccounts, selectedIds],
  );
  const fundingLabel = useMemo(() => {
    const selected = draft.assetAccountIds
      .map(id => liquidAssetAccounts.find(account => account.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    return selected.length
      ? selected.join(', ')
      : (liquidAssetAccounts[0]?.name ?? budgetFormStrings.automaticAccount);
  }, [draft.assetAccountIds, liquidAssetAccounts]);

  const isDraftInitialized = !budgetId || isSeededEntity;

  const spendingHistory$ = useMemo(
    () =>
      budgetReadService.observeSpendingHistory(
        workplaceId,
        draft.selectedAccountIds,
        {
          intervalType: draft.intervalType,
          intervalN: draft.intervalN,
          startDate: draft.startDate ?? draft.startMonth.getTime(),
          recurrenceDay: draft.recurrenceDay,
          recurrenceMonth: draft.recurrenceMonth,
        },
        draft.currencyCode,
      ),
    [
      workplaceId,
      draft.selectedAccountIds,
      draft.intervalType,
      draft.intervalN,
      draft.startDate,
      draft.startMonth,
      draft.recurrenceDay,
      draft.recurrenceMonth,
      draft.currencyCode,
    ],
  );
  const { data: spendingHistory = [] } = useObservable<BudgetSpendingHistoryEntry[]>(
    () => spendingHistory$,
    [spendingHistory$],
    [],
    { keepPreviousData: false },
  );
  const averageSpend = calculateAverageSpend(
    spendingHistory,
    spendingHistory.map(period => period.transactionCount),
    draft.currencyCode,
    spendingHistory.map(period => period.hasUnvaluedEntries),
  );
  const useAverage = useCallback(() => {
    if (averageSpend == null) return;
    const precision = getCurrencyPrecision(draft.currencyCode);
    setDraft(d => ({ ...d, amount: roundToPrecision(averageSpend, precision).toFixed(precision) }));
  }, [averageSpend, draft.currencyCode, setDraft]);
  const amountLabel = formatBudgetAmountLabel(draft.intervalType, draft.intervalN);
  const scheduleStartDate = draft.startDate ?? draft.startMonth.getTime();

  const loading =
    !!budgetId &&
    !pName &&
    !isDraftInitialized &&
    (budgetLoading || scopesLoading || observedBudget != null);

  const setName = useCallback((name: string) => setDraft(d => ({ ...d, name })), [setDraft]);
  const setAmount = useCallback((amount: string) => setDraft(d => ({ ...d, amount })), [setDraft]);
  const setCurrencyCode = useCallback(
    (currencyCode: string) => setDraft(d => ({ ...d, currencyCode })),
    [setDraft],
  );
  const setSchedule = useCallback(
    (value: ScheduleValue) =>
      setDraft(d => ({
        ...d,
        intervalType: value.intervalType,
        intervalN: value.intervalN,
        recurrenceDay: value.intervalType === 'DAILY' ? undefined : value.recurrenceDay,
        recurrenceMonth: value.intervalType === 'YEARLY' ? value.recurrenceMonth : undefined,
      })),
    [setDraft],
  );
  const setSelectedAccountIds = useCallback(
    (selectedAccountIds: AccountId[]) => setDraft(d => ({ ...d, selectedAccountIds })),
    [setDraft],
  );
  const addCategory = useCallback(
    (id: AccountId) =>
      setDraft(d =>
        d.selectedAccountIds.includes(id)
          ? d
          : { ...d, selectedAccountIds: [...d.selectedAccountIds, id] },
      ),
    [setDraft],
  );
  const removeCategory = useCallback(
    (id: AccountId) =>
      setDraft(d => ({
        ...d,
        selectedAccountIds: d.selectedAccountIds.filter(selectedId => selectedId !== id),
      })),
    [setDraft],
  );
  const setAssetAccountIds = useCallback(
    (assetAccountIds: AccountId[]) => setDraft(d => ({ ...d, assetAccountIds })),
    [setDraft],
  );

  const parsedAmount = Number.parseFloat(draft.amount);
  const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const save = useCallback(async () => {
    assertBound();
    if (isSubmittingRef.current) return;
    if (!draft.name.trim() || !hasValidAmount || draft.selectedAccountIds.length === 0) {
      throw new Error('Please fill all required fields and select at least one account.');
    }
    if (budgetId && !observedBudget) {
      throw new Error('This budget could not be found.');
    }
    if (!isValidRepeatCount(draft.intervalN)) {
      throw new Error('Enter a whole number from 1 to 9999.');
    }

    isSubmittingRef.current = true;
    setIsSaving(true);
    try {
      const monthStr = `${draft.startMonth.getFullYear()}-${String(draft.startMonth.getMonth() + 1).padStart(2, '0')}`;

      const resolvedStartDate =
        draft.intervalType === 'DAILY'
          ? (draft.startDate ?? dayjs().startOf('day').valueOf())
          : draft.startDate;

      const input = {
        name: draft.name.trim(),
        amount: parsedAmount,
        currencyCode: draft.currencyCode,
        startMonth: monthStr,
        intervalType: draft.intervalType,
        intervalN: draft.intervalN,
        startDate: resolvedStartDate,
        recurrenceDay: draft.recurrenceDay,
        recurrenceMonth: draft.recurrenceMonth || 1,
        active: true,
        assetAccountIds: draft.assetAccountIds,
      };

      if (observedBudget) {
        await budgetWriteService.updateBudget(
          workplaceId,
          observedBudget.id,
          input,
          draft.selectedAccountIds,
        );
      } else {
        await budgetWriteService.createBudget(workplaceId, input, draft.selectedAccountIds);
      }
      setLeaveAfterSave(() => AppNavigation.back);
    } catch (error) {
      isSubmittingRef.current = false;
      setIsSaving(false);
      throw error;
    }
  }, [assertBound, budgetId, draft, hasValidAmount, observedBudget, parsedAmount, workplaceId]);

  return {
    leaveAfterSave,
    expenseAccounts,
    liquidAssetAccounts,
    budget: observedBudget,
    name: draft.name,
    setName,
    amount: draft.amount,
    setAmount,
    startMonth: draft.startMonth,
    schedule: {
      intervalType: draft.intervalType as ScheduleValue['intervalType'],
      intervalN: draft.intervalN,
      ...(draft.recurrenceDay !== undefined && { recurrenceDay: draft.recurrenceDay }),
      ...(draft.recurrenceMonth !== undefined && { recurrenceMonth: draft.recurrenceMonth }),
    },
    setSchedule,
    scheduleStartDate,
    selectedAccountIds: draft.selectedAccountIds,
    setSelectedAccountIds,
    selectedCategories,
    categorySuggestions,
    addCategory,
    removeCategory,
    assetAccountIds: draft.assetAccountIds,
    setAssetAccountIds,
    fundingLabel,
    spendingHistory,
    averageSpend,
    useAverage,
    amountLabel,
    currencies,
    currencyCode: draft.currencyCode,
    setCurrencyCode,
    save,
    loading,
    isSaving,
    isFormValid: Boolean(
      draft.name.trim() &&
      hasValidAmount &&
      draft.selectedAccountIds.length > 0 &&
      isValidRepeatCount(draft.intervalN) &&
      (!budgetId || observedBudget != null),
    ),
    requirementHint: formatRequirementHint(
      [
        !draft.name.trim() && 'a name',
        !draft.amount && 'an amount',
        draft.selectedAccountIds.length === 0 && 'at least one category',
      ].filter((item): item is string => Boolean(item)),
    ),
    onCancel: AppNavigation.back,
  };
}

export type BudgetEditViewModel = ReturnType<typeof useBudgetEditViewModel>;
