import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import {
  BudgetEditDraft,
  createEmptyBudgetDraft,
  mapBudgetToEditDraft,
  shouldSeedBudgetDraft,
} from '@/src/features/budget/hooks/budgetEditDraft';
import { useObservable } from '@/src/hooks/useObservable';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { currencyReadService } from '@/src/services/currency-read-service';
import { AccountId, BudgetId } from '@/src/types/domain';
import { isLiquidAssetSubtype } from '@/src/utils/accountSubtypeUtils';
import { AppNavigation } from '@/src/utils/navigation';
import dayjs from 'dayjs';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { of } from 'rxjs';

/**
 * Budget create/edit form.
 * Draft fields are intentional local state, seeded once per `budgetId` from
 * observeById + observeScopes. Later observe ticks never overwrite a dirty draft.
 */
export function useBudgetEditViewModel() {
  const params = useLocalSearchParams<{
    id: BudgetId;
    pName?: string;
    pAmount?: string;
    pCurrency?: string;
  }>();
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const budgetId = params.id;

  const { data: expenseAccounts = [] } = useObservable(
    () => accountQueries.observeByType(workplaceId, AccountType.EXPENSE),
    [workplaceId],
    [],
  );
  const { data: assetAccounts = [] } = useObservable(
    () => accountQueries.observeByType(workplaceId, AccountType.ASSET),
    [workplaceId],
    [],
  );
  const liquidAssetAccounts = assetAccounts.filter(a => isLiquidAssetSubtype(a.accountSubtype));

  const { data: currencies = [] } = useObservable(() => currencyReadService.observeAll(), [], []);

  const pName = params.pName || '';
  const pAmount = params.pAmount || '';
  const pCurrency = params.pCurrency || workplaceCurrency;

  const { data: observedBudget, isLoading: budgetLoading } = useObservable<Budget | null>(
    () => (budgetId ? budgetReadService.observeById(workplaceId, budgetId) : of(null)),
    [workplaceId, budgetId],
    null,
  );

  const { data: scopes = [], isLoading: scopesLoading } = useObservable<BudgetScope[]>(
    () => (budgetId ? budgetReadService.observeScopes(workplaceId, budgetId) : of([])),
    [workplaceId, budgetId],
    [],
  );

  const [seededBudgetId, setSeededBudgetId] = useState<BudgetId | null>(null);
  const [draft, setDraft] = useState<BudgetEditDraft>(() =>
    createEmptyBudgetDraft({ name: pName, amount: pAmount, currencyCode: pCurrency }),
  );
  const [isSaving, setIsSaving] = useState(false);

  const scopesReady = !budgetId || !scopesLoading;
  const canSeed = shouldSeedBudgetDraft({
    budgetId,
    seededBudgetId,
    observedBudget,
    scopesReady,
  });

  // Seed once per entity id during render — never on every observe tick.
  if (canSeed && observedBudget) {
    setSeededBudgetId(budgetId);
    setDraft(mapBudgetToEditDraft(observedBudget, scopes, workplaceCurrency));
  } else if (!budgetId && seededBudgetId !== null) {
    setSeededBudgetId(null);
    setDraft(createEmptyBudgetDraft({ name: pName, amount: pAmount, currencyCode: pCurrency }));
  }

  const loading =
    !!budgetId &&
    !pName &&
    seededBudgetId !== budgetId &&
    (budgetLoading || scopesLoading || observedBudget != null);

  const setName = useCallback((name: string) => setDraft(d => ({ ...d, name })), []);
  const setAmount = useCallback((amount: string) => setDraft(d => ({ ...d, amount })), []);
  const setCurrencyCode = useCallback(
    (currencyCode: string) => setDraft(d => ({ ...d, currencyCode })),
    [],
  );
  const setStartMonth = useCallback(
    (startMonth: Date) => setDraft(d => ({ ...d, startMonth })),
    [],
  );
  const setIntervalType = useCallback(
    (intervalType: string) => setDraft(d => ({ ...d, intervalType })),
    [],
  );
  const setIntervalN = useCallback((intervalN: number) => setDraft(d => ({ ...d, intervalN })), []);
  const setRecurrenceDay = useCallback(
    (recurrenceDay: number) => setDraft(d => ({ ...d, recurrenceDay })),
    [],
  );
  const setRecurrenceMonth = useCallback(
    (recurrenceMonth: number) => setDraft(d => ({ ...d, recurrenceMonth })),
    [],
  );
  const setStartDate = useCallback(
    (startDate: number | undefined) => setDraft(d => ({ ...d, startDate })),
    [],
  );
  const setSelectedAccountIds = useCallback(
    (selectedAccountIds: AccountId[]) => setDraft(d => ({ ...d, selectedAccountIds })),
    [],
  );
  const setAssetAccountIds = useCallback(
    (assetAccountIds: AccountId[]) => setDraft(d => ({ ...d, assetAccountIds })),
    [],
  );

  const save = useCallback(async () => {
    if (!draft.name.trim() || !draft.amount || draft.selectedAccountIds.length === 0) {
      throw new Error('Please fill all required fields and select at least one account.');
    }

    setIsSaving(true);
    try {
      const parsedAmount = parseFloat(draft.amount);
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
        intervalN: draft.intervalN || 1,
        startDate: resolvedStartDate,
        recurrenceDay: draft.recurrenceDay || 1,
        recurrenceMonth: draft.recurrenceMonth || 1,
        active: true,
        assetAccountIds: draft.assetAccountIds,
      };

      if (observedBudget) {
        await budgetWriteService.updateBudget(
          workplaceId,
          observedBudget,
          input,
          draft.selectedAccountIds,
        );
      } else {
        await budgetWriteService.createBudget(workplaceId, input, draft.selectedAccountIds);
      }
      AppNavigation.back();
    } finally {
      setIsSaving(false);
    }
  }, [draft, observedBudget, workplaceId]);

  return {
    expenseAccounts,
    liquidAssetAccounts,
    budget: observedBudget,
    name: draft.name,
    setName,
    amount: draft.amount,
    setAmount,
    startMonth: draft.startMonth,
    setStartMonth,
    intervalType: draft.intervalType,
    setIntervalType,
    intervalN: draft.intervalN,
    setIntervalN,
    recurrenceDay: draft.recurrenceDay,
    setRecurrenceDay,
    recurrenceMonth: draft.recurrenceMonth,
    setRecurrenceMonth,
    startDate: draft.startDate,
    setStartDate,
    selectedAccountIds: draft.selectedAccountIds,
    setSelectedAccountIds,
    assetAccountIds: draft.assetAccountIds,
    setAssetAccountIds,
    currencies,
    currencyCode: draft.currencyCode,
    setCurrencyCode,
    save,
    loading,
    isSaving,
    isFormValid: draft.name.trim() && draft.amount && draft.selectedAccountIds.length > 0,
  };
}
