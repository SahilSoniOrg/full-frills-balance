import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { useObservable } from '@/src/hooks/useObservable';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { AccountId, BudgetId } from '@/src/types/domain';
import { isLiquidAssetSubtype } from '@/src/utils/accountSubtypeUtils';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';

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

  const { data: currencies = [] } = useObservable(() => currencyRepository.observeAll(), [], []);

  // Initial Data Injection: Extract preview data from params
  const pName = params.pName || '';
  const pAmount = params.pAmount || '';
  const pCurrency = params.pCurrency || workplaceCurrency;

  const [budget, setBudget] = useState<Budget | null>(null);
  const [name, setName] = useState(pName);
  const [amount, setAmount] = useState(pAmount);
  const [currencyCode, setCurrencyCode] = useState<string>(pCurrency);
  const [startMonth, setStartMonth] = useState(new Date());
  const [intervalType, setIntervalType] = useState('MONTHLY');
  const [intervalN, setIntervalN] = useState(1);
  const [recurrenceDay, setRecurrenceDay] = useState(1);
  const [recurrenceMonth, setRecurrenceMonth] = useState(1);
  const [startDate, setStartDate] = useState<number | undefined>(undefined);
  const [selectedAccountIds, setSelectedAccountIds] = useState<AccountId[]>([]);
  const [assetAccountIds, setAssetAccountIds] = useState<AccountId[]>([]);
  const [loading, setLoading] = useState(!!budgetId && !pName);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!budgetId) return;

    budgetRepository
      .find(workplaceId, budgetId)
      .then(async b => {
        if (!b) return;
        setBudget(b);
        setName(b.name);
        setAmount(b.amount.toString());
        setCurrencyCode(b.currencyCode || workplaceCurrency);
        const [year, month] = b.startMonth.split('-');
        setStartMonth(new Date(parseInt(year), parseInt(month) - 1, 1));
        setIntervalType(b.intervalType || 'MONTHLY');
        setIntervalN(b.intervalN || 1);
        setRecurrenceDay(b.recurrenceDay || 1);
        setRecurrenceMonth(b.recurrenceMonth || 1);
        setStartDate(b.startDate);

        const scopes = await budgetRepository.getScopes(workplaceId, budgetId);
        setSelectedAccountIds(scopes.map(s => s.accountId));

        if (b.assetAccountIds) {
          setAssetAccountIds(b.assetAccountIds.split(',') as AccountId[]);
        }

        setLoading(false);
      })
      .catch(e => {
        logger.error('Failed to load budget', e);
        setLoading(false);
      });
  }, [workplaceId, budgetId, workplaceCurrency]);

  const save = useCallback(async () => {
    if (!name.trim() || !amount || selectedAccountIds.length === 0) {
      throw new Error('Please fill all required fields and select at least one account.');
    }

    setIsSaving(true);
    try {
      const parsedAmount = parseFloat(amount);
      const monthStr = `${startMonth.getFullYear()}-${String(startMonth.getMonth() + 1).padStart(2, '0')}`;

      const resolvedStartDate =
        intervalType === 'DAILY' ? (startDate ?? dayjs().startOf('day').valueOf()) : startDate;

      const input = {
        name: name.trim(),
        amount: parsedAmount,
        currencyCode,
        startMonth: monthStr,
        intervalType,
        intervalN: intervalN || 1,
        startDate: resolvedStartDate,
        recurrenceDay: recurrenceDay || 1,
        recurrenceMonth: recurrenceMonth || 1,
        active: true,
        assetAccountIds,
      };

      if (budget) {
        await budgetWriteService.updateBudget(workplaceId, budget, input, selectedAccountIds);
      } else {
        await budgetWriteService.createBudget(workplaceId, input, selectedAccountIds);
      }
      AppNavigation.back();
    } finally {
      setIsSaving(false);
    }
  }, [
    budget,
    name,
    amount,
    startMonth,
    selectedAccountIds,
    assetAccountIds,
    currencyCode,
    intervalType,
    intervalN,
    startDate,
    recurrenceDay,
    recurrenceMonth,
    workplaceId,
  ]);

  return {
    expenseAccounts,
    liquidAssetAccounts,
    budget,
    name,
    setName,
    amount,
    setAmount,
    startMonth,
    setStartMonth,
    intervalType,
    setIntervalType,
    intervalN,
    setIntervalN,
    recurrenceDay,
    setRecurrenceDay,
    recurrenceMonth,
    setRecurrenceMonth,
    startDate,
    setStartDate,
    selectedAccountIds,
    setSelectedAccountIds,
    assetAccountIds,
    setAssetAccountIds,
    currencies,
    currencyCode,
    setCurrencyCode,
    save,
    loading,
    isSaving,
    isFormValid: name.trim() && amount && selectedAccountIds.length > 0,
  };
}
