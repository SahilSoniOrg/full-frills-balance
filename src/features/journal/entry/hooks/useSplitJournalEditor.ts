import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import { generator as generateId } from '@/src/data/database/idGenerator';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import {
  buildJournalLinesFromSplitState,
  computeSplitTotals,
  createEmptySplitRow,
  SPLIT_SOURCE_LINE_ID,
  SplitRowState,
  validateSplitState,
} from '@/src/services/journal/splitJournalHelpers';
import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useJournalEditor } from './useJournalEditor';
import { SplitJournalController } from '@/src/features/journal/entry/modes/split/splitJournalState';

export interface UseSplitJournalEditorProps {
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  onSelectAccountRequest: (lineId: string) => void;
  isActive: boolean;
}

export function useSplitJournalEditor({
  accounts,
  editor,
  onSelectAccountRequest,
  isActive,
}: UseSplitJournalEditorProps): SplitJournalController {
  const { workplaceId: _workplaceId } = useWorkplace();
  void _workplaceId; // reserved for per-workplace journalNav prefs (F9)
  const { transactionAccounts, expenseAccounts } = useAccountSelection({ accounts });
  const initializedRef = useRef(false);

  const {
    setTransactionType,
    setIsGuidedMode,
    isEdit,
    submit,
    isSubmitting,
    description,
    setDescription,
  } = editor;

  const [sourceAccountId, setSourceAccountId] = useState<AccountId>(EMPTY_ACCOUNT_ID);
  const [totalAmount, setTotalAmount] = useState('');
  const [splits, setSplits] = useState<SplitRowState[]>(() => [
    createEmptySplitRow(generateId()),
    createEmptySplitRow(generateId()),
  ]);

  const resolvedSourceAccountId = useMemo(() => {
    if (sourceAccountId !== EMPTY_ACCOUNT_ID) return sourceAccountId;
    if (!isActive || isEdit) return EMPTY_ACCOUNT_ID;
    const lastSourceId = preferences.journalNav.lastUsedSourceAccountId;
    if (lastSourceId && transactionAccounts.some(a => a.id === lastSourceId)) {
      return lastSourceId;
    }
    return EMPTY_ACCOUNT_ID;
  }, [sourceAccountId, isActive, isEdit, transactionAccounts]);

  useEffect(() => {
    if (!isActive) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    setTransactionType('expense');
    setIsGuidedMode(false);
  }, [isActive, setTransactionType, setIsGuidedMode]);

  const totals = useMemo(() => computeSplitTotals(totalAmount, splits), [totalAmount, splits]);

  const validation = useMemo(
    () =>
      validateSplitState({
        sourceAccountId: resolvedSourceAccountId,
        totalAmount,
        splits,
      }),
    [resolvedSourceAccountId, totalAmount, splits],
  );

  const isValid = validation.valid;

  const sourceAccount = useMemo(
    () => accounts.find(a => a.id === resolvedSourceAccountId),
    [accounts, resolvedSourceAccountId],
  );

  const displayCurrency = sourceAccount?.currencyCode || accounts[0]?.currencyCode || 'USD';

  const addSplitRow = useCallback(() => {
    setSplits(prev => [...prev, createEmptySplitRow(generateId())]);
  }, []);

  const removeSplitRow = useCallback((id: string) => {
    setSplits(prev => {
      if (prev.length <= 2) return prev;
      return prev.filter(row => row.id !== id);
    });
  }, []);

  const updateSplitRow = useCallback(
    (id: string, patch: Partial<Pick<SplitRowState, 'accountId' | 'amount'>>) => {
      setSplits(prev => prev.map(row => (row.id === id ? { ...row, ...patch } : row)));
    },
    [],
  );

  const openSourceAccountPicker = useCallback(() => {
    onSelectAccountRequest(SPLIT_SOURCE_LINE_ID);
  }, [onSelectAccountRequest]);

  const openSplitAccountPicker = useCallback(
    (splitId: string) => {
      onSelectAccountRequest(splitId);
    },
    [onSelectAccountRequest],
  );

  const handleSave = useCallback(async () => {
    if (!isValid) return;

    const lines = buildJournalLinesFromSplitState({
      sourceAccountId: resolvedSourceAccountId,
      sourceAmount: totalAmount,
      splits,
      accounts,
    });

    let overrides: { description?: string; lines: typeof lines } = { lines };
    if (!description.trim()) {
      const defaultDesc = AppConfig.strings.transactionFlow.splitEntry.defaultDescription;
      setDescription(defaultDesc);
      overrides = { description: defaultDesc, lines };
    }

    if (resolvedSourceAccountId) {
      preferences.journalNav.setLastUsedSourceAccountId(resolvedSourceAccountId);
    }

    await submit(overrides);
  }, [
    isValid,
    description,
    setDescription,
    submit,
    resolvedSourceAccountId,
    totalAmount,
    splits,
    accounts,
  ]);

  return useMemo(
    () => ({
      sourceAccountId: resolvedSourceAccountId,
      setSourceAccountId,
      totalAmount,
      setTotalAmount,
      splits,
      addSplitRow,
      removeSplitRow,
      updateSplitRow,
      totals,
      isValid,
      validationError: validation.valid ? null : validation.error,
      transactionAccounts,
      expenseAccounts,
      sourceAccount,
      displayCurrency,
      openSourceAccountPicker,
      openSplitAccountPicker,
      handleSave,
      isSubmitting,
      isValidTotal: parseSimpleAmountInput(totalAmount) > 0,
    }),
    [
      resolvedSourceAccountId,
      totalAmount,
      splits,
      addSplitRow,
      removeSplitRow,
      updateSplitRow,
      totals,
      isValid,
      validation,
      transactionAccounts,
      expenseAccounts,
      sourceAccount,
      displayCurrency,
      openSourceAccountPicker,
      openSplitAccountPicker,
      handleSave,
      isSubmitting,
    ],
  );
}
