import type { AccountFields } from '@/src/types/plainDtos';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import { SplitJournalController } from '@/src/features/journal/entry/modes/split/splitJournalState';
import {
  computeSplitTotals,
  SPLIT_SOURCE_LINE_ID,
  validateSplitState,
} from '@/src/services/journal/splitJournalHelpers';
import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useJournalEditor } from './useJournalEditor';

export interface UseSplitJournalEditorProps {
  accounts: AccountFields[];
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

  const { setTransactionType, setIsGuidedMode, isEdit, isSubmitting } = editor;

  const sourceLine = editor.lines.find(line => line.transactionType === 'CREDIT');
  const destinationLines = editor.lines.filter(line => line.transactionType === 'DEBIT');
  const sourceAccountId = sourceLine?.accountId ?? EMPTY_ACCOUNT_ID;
  const totalAmount = sourceLine?.amount ?? '';
  const splits = useMemo(
    () =>
      destinationLines.map(line => ({
        id: line.id,
        accountId: line.accountId,
        amount: line.amount,
      })),
    [destinationLines],
  );

  const setSourceAccountId = useCallback(
    (accountId: AccountId) => {
      if (!sourceLine) return;
      const account = accounts.find(candidate => candidate.id === accountId);
      editor.updateLine(sourceLine.id, {
        accountId,
        accountName: account?.name ?? '',
        accountType: account?.accountType,
        accountCurrency: account?.currencyCode,
      });
    },
    [accounts, editor, sourceLine],
  );

  const setTotalAmount = useCallback(
    (amount: string) => {
      if (sourceLine) editor.updateLine(sourceLine.id, { amount });
    },
    [editor, sourceLine],
  );

  const addSplitRow = editor.addLine;
  const removeSplitRow = editor.removeLine;
  const updateSplitRow = useCallback(
    (id: string, patch: Partial<Pick<(typeof splits)[number], 'accountId' | 'amount'>>) => {
      editor.updateLine(id, patch);
    },
    [editor],
  );

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
    if (!isActive || sourceAccountId !== EMPTY_ACCOUNT_ID) return;
    if (resolvedSourceAccountId !== EMPTY_ACCOUNT_ID) {
      setSourceAccountId(resolvedSourceAccountId);
    }
  }, [isActive, resolvedSourceAccountId, setSourceAccountId, sourceAccountId]);

  useEffect(() => {
    if (!isActive) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    setTransactionType('expense');
    setIsGuidedMode(false);
  }, [isActive, setIsGuidedMode, setTransactionType]);

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
      isSubmitting,
      isValidTotal: parseSimpleAmountInput(totalAmount) > 0,
    }),
    [
      resolvedSourceAccountId,
      setSourceAccountId,
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
      isSubmitting,
      setTotalAmount,
    ],
  );
}
