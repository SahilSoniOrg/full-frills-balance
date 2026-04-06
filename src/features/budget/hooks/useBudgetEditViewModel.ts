import { AppConfig } from '@/src/constants/app-config';
import { useUI } from '@/src/contexts/UIContext';
import { AccountType } from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { useObservable } from '@/src/hooks/useObservable';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { isLiquidAssetSubtype } from '@/src/utils/accountSubtypeUtils';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

export function useBudgetEditViewModel() {
  const params = useLocalSearchParams();
  const budgetId = params.id as string;
  const { defaultCurrency } = useUI();
  const { data: expenseAccounts = [] } = useObservable(
    () => accountRepository.observeByType(AccountType.EXPENSE),
    [],
    [],
  );
  const { data: assetAccounts = [] } = useObservable(
    () => accountRepository.observeByType(AccountType.ASSET),
    [],
    [],
  );
  const liquidAssetAccounts = assetAccounts.filter(a => isLiquidAssetSubtype(a.accountSubtype));

  const { data: currencies = [] } = useObservable(() => currencyRepository.observeAll(), [], []);

  // Initial Data Injection: Extract preview data from params
  const pName = params.pName as string;
  const pAmount = params.pAmount as string;
  const pCurrency = params.pCurrency as string;

  const [budget, setBudget] = useState<Budget | null>(null);
  const [name, setName] = useState(pName || '');
  const [amount, setAmount] = useState(pAmount || '');
  const [currencyCode, setCurrencyCode] = useState<string>(
    pCurrency || defaultCurrency || AppConfig.defaultCurrency,
  );
  const [startMonth, setStartMonth] = useState(new Date());
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [assetAccountIds, setAssetAccountIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(!!budgetId && !pName);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (budgetId) {
      budgetRepository
        .find(budgetId)
        .then(async b => {
          if (!b) return;
          setBudget(b);
          setName(b.name);
          setAmount(b.amount.toString());
          setCurrencyCode(b.currencyCode || defaultCurrency || AppConfig.defaultCurrency);
          const [year, month] = b.startMonth.split('-');
          setStartMonth(new Date(parseInt(year), parseInt(month) - 1, 1));

          const scopes = await budgetRepository.getScopes(budgetId);
          setSelectedAccountIds(scopes.map(s => s.account.id));

          if (b.assetAccountIds) {
            setAssetAccountIds(b.assetAccountIds.split(','));
          }

          setLoading(false);
        })
        .catch(e => {
          logger.error('Failed to load budget', e);
          setLoading(false);
        });
    }
  }, [budgetId, defaultCurrency]);

  const save = useCallback(async () => {
    if (!name.trim() || !amount || selectedAccountIds.length === 0) {
      throw new Error('Please fill all required fields and select at least one account.');
    }

    setIsSaving(true);
    try {
      const parsedAmount = parseFloat(amount);
      const monthStr = `${startMonth.getFullYear()}-${String(startMonth.getMonth() + 1).padStart(2, '0')}`;

      const input = {
        name: name.trim(),
        amount: parsedAmount,
        currencyCode,
        startMonth: monthStr,
        active: true,
        assetAccountIds: assetAccountIds.length > 0 ? assetAccountIds : undefined,
      };

      if (budget) {
        await budgetWriteService.updateBudget(budget, input, selectedAccountIds);
      } else {
        await budgetWriteService.createBudget(input, selectedAccountIds);
      }
      AppNavigation.back();
    } finally {
      setIsSaving(false);
    }
  }, [budget, name, amount, startMonth, selectedAccountIds, assetAccountIds, currencyCode]);

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
