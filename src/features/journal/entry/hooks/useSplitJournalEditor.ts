import { AppConfig } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import { SplitJournalController } from '@/src/features/journal/entry/modes/split/splitJournalState';
import {
  buildJournalLinesFromSplitState,
  computeSplitTotals,
  SPLIT_SOURCE_LINE_ID,
  validateSplitState,
} from '@/src/services/journal/splitJournalHelpers';
import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useJournalEditor } from './useJournalEditor';
import { useSplitEntryState } from './useSplitEntryState';

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

  const {
    sourceAccountId,
    setSourceAccountId,
    totalAmount,
    setTotalAmount,
    splits,
    addSplitRow,
    removeSplitRow,
    updateSplitRow,
  } = useSplitEntryState();

  const pinnedAccountIds = useMemo(() => {
    const selectedIds = [
      sourceAccountId !== EMPTY_ACCOUNT_ID ? sourceAccountId : undefined,
      ...splits.map(split => split.accountId),
    ].filter((id): id is AccountId => !!id && id !== EMPTY_ACCOUNT_ID);
    return pinnedArchivedAccountIds(selectedIds, accounts);
  }, [accounts, sourceAccountId, splits]);

  const { transactionAccounts, expenseAccounts } = useAccountSelection({
    accounts,
    pinnedAccountIds,
  });

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
      setSourceAccountId,
      totalAmount,
      setTotalAmount,
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
