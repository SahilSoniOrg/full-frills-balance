import type { AccountFields } from '@/src/types/plainDtos';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import { SplitJournalController } from '@/src/features/journal/entry/modes/split/splitJournalState';
import { type SplitRowState } from '@/src/services/journal/splitJournalHelpers';
import {
  selectSplitDraftLines,
  useSplitDraftProjection,
} from '@/src/features/journal/entry/modes/split/splitDraftProjection';
import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { TabType } from '@/src/types/domainJournal';
import { TransactionType } from '@/src/types/enums';
import { pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import {
  filterGuidedLegAccounts,
  isAccountAllowedOnGuidedLeg,
} from '@/src/services/journal/guidedJournalAccountEligibility';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { preferences } from '@/src/services/preferences';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useJournalEditor } from './useJournalEditor';

export interface UseSplitJournalEditorProps {
  accounts: AccountFields[];
  workplaceCurrency: string;
  editor: Pick<
    ReturnType<typeof useJournalEditor>,
    | 'setIsGuidedMode'
    | 'isEdit'
    | 'isSubmitting'
    | 'lines'
    | 'updateLine'
    | 'updateLines'
    | 'setLines'
    | 'addLine'
    | 'transactionType'
    | 'setTransactionType'
    | 'journalDate'
  >;
}

export function useSplitJournalEditor({
  accounts,
  workplaceCurrency,
  editor,
}: UseSplitJournalEditorProps): SplitJournalController {
  const initializedRef = useRef(false);

  const { setIsGuidedMode, isEdit, isSubmitting } = editor;

  const { sourceLine, destinationLines } = useMemo(
    () => selectSplitDraftLines(editor.lines),
    [editor.lines],
  );
  const lineSourceAccountId = sourceLine?.accountId ?? EMPTY_ACCOUNT_ID;

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
  const removeSplitRow = useCallback(
    (id: string) => {
      editor.setLines(previous => {
        const splitRows = previous.filter(line => line.transactionType === TransactionType.DEBIT);
        const targetIsSplitRow = splitRows.some(line => line.id === id);

        // A split entry must retain at least one allocation row. Keeping the
        // invariant here protects callers beyond the current swipe UI.
        if (!targetIsSplitRow || splitRows.length <= 1) return previous;

        return previous.filter(line => line.id !== id);
      });
    },
    [editor],
  );
  const updateSplitRow = useCallback(
    (id: string, patch: Partial<Pick<SplitRowState, 'accountId' | 'amount' | 'exchangeRate'>>) => {
      if (patch.accountId !== undefined) {
        const account = accounts.find(candidate => candidate.id === patch.accountId);
        editor.updateLine(id, {
          ...patch,
          exchangeRate: '',
          accountName: account?.name ?? '',
          accountType: account?.accountType,
          accountCurrency: account?.currencyCode,
        });
        return;
      }

      const { exchangeRate, ...linePatch } = patch;
      editor.updateLine(id, {
        ...linePatch,
        ...(exchangeRate === undefined ? {} : { exchangeRate: String(exchangeRate) }),
      });
    },
    [accounts, editor],
  );
  const updateSourceExchangeRate = useCallback(
    (exchangeRate: string) => {
      if (sourceLine) editor.updateLine(sourceLine.id, { exchangeRate });
    },
    [editor, sourceLine],
  );
  const updateSplitAmounts = useCallback(
    (updates: Record<string, string>) => {
      const lineUpdates = Object.entries(updates).reduce<Record<string, { amount: string }>>(
        (batch, [id, amount]) => {
          batch[id] = { amount };
          return batch;
        },
        {},
      );
      editor.updateLines(lineUpdates);
    },
    [editor],
  );

  const pinnedAccountIds = useMemo(() => {
    const selectedIds = [
      lineSourceAccountId !== EMPTY_ACCOUNT_ID ? lineSourceAccountId : undefined,
      ...destinationLines.map(line => line.accountId),
    ].filter((id): id is AccountId => !!id && id !== EMPTY_ACCOUNT_ID);
    return pinnedArchivedAccountIds(selectedIds, accounts);
  }, [accounts, destinationLines, lineSourceAccountId]);

  const { leafAccounts } = useAccountSelection({
    accounts,
    pinnedAccountIds,
  });

  const transactionType = editor.transactionType;
  const sourceAccounts = useMemo(
    () => filterGuidedLegAccounts(leafAccounts, transactionType, TransactionType.CREDIT),
    [leafAccounts, transactionType],
  );
  const allocationAccounts = useMemo(
    () => filterGuidedLegAccounts(leafAccounts, transactionType, TransactionType.DEBIT),
    [leafAccounts, transactionType],
  );

  const setTransactionType = useCallback(
    (nextType: TabType) => {
      if (nextType === editor.transactionType) return;

      editor.setTransactionType(nextType);
      const accountsById = new Map(accounts.map(account => [account.id, account]));
      const clearInvalidSelection = (
        line: (typeof editor.lines)[number],
        side: TransactionType,
      ) => {
        if (!line.accountId || line.accountId === EMPTY_ACCOUNT_ID) return;
        const account = accountsById.get(line.accountId);
        if (account && isAccountAllowedOnGuidedLeg(account, nextType, side)) return;

        editor.updateLine(line.id, {
          accountId: EMPTY_ACCOUNT_ID,
          accountName: '',
          accountType: getInferredAccountType(nextType, side),
          accountCurrency: undefined,
        });
      };

      if (sourceLine) clearInvalidSelection(sourceLine, TransactionType.CREDIT);
      destinationLines.forEach(line => clearInvalidSelection(line, TransactionType.DEBIT));
    },
    [accounts, destinationLines, editor, sourceLine],
  );

  const resolvedSourceAccountId = useMemo(() => {
    if (lineSourceAccountId !== EMPTY_ACCOUNT_ID) return lineSourceAccountId;
    if (isEdit) return EMPTY_ACCOUNT_ID;
    const lastSourceId = preferences.journalNav.lastUsedSourceAccountId;
    if (lastSourceId && sourceAccounts.some(a => a.id === lastSourceId)) {
      return lastSourceId;
    }
    return EMPTY_ACCOUNT_ID;
  }, [isEdit, lineSourceAccountId, sourceAccounts]);

  useEffect(() => {
    if (lineSourceAccountId !== EMPTY_ACCOUNT_ID) return;
    if (resolvedSourceAccountId !== EMPTY_ACCOUNT_ID) {
      setSourceAccountId(resolvedSourceAccountId);
    }
  }, [lineSourceAccountId, resolvedSourceAccountId, setSourceAccountId]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    setIsGuidedMode(false);
  }, [setIsGuidedMode]);

  const sourceAccount = useMemo(
    () => accounts.find(account => account.id === resolvedSourceAccountId),
    [accounts, resolvedSourceAccountId],
  );
  const displayCurrency = sourceAccount?.currencyCode || workplaceCurrency;
  const splitDraft = useSplitDraftProjection({
    lines: editor.lines,
    accounts,
    workplaceCurrency,
    sourceAccountId: resolvedSourceAccountId,
    precisionCurrency: displayCurrency,
  });
  const { precision, currencyContext, totals, totalAmount, splits } = splitDraft;
  const isValid = splitDraft.validation.valid;

  return useMemo(
    () => ({
      transactionType,
      setTransactionType,
      sourceAccountId: splitDraft.sourceAccountId,
      setSourceAccountId,
      totalAmount,
      setTotalAmount,
      updateSourceExchangeRate,
      splits,
      addSplitRow,
      removeSplitRow,
      updateSplitRow,
      updateSplitAmounts,
      totals,
      isValid,
      validationError: splitDraft.validation.valid ? null : splitDraft.validation.error,
      allAccounts: accounts,
      sourceAccounts,
      allocationAccounts,
      sourceAccount,
      displayCurrency,
      precision,
      journalDate: editor.journalDate,
      currencyContext,
      isSubmitting,
      isValidTotal: parseSimpleAmountInput(totalAmount) > 0,
    }),
    [
      transactionType,
      setTransactionType,
      splitDraft,
      setSourceAccountId,
      totalAmount,
      updateSourceExchangeRate,
      splits,
      addSplitRow,
      removeSplitRow,
      updateSplitRow,
      updateSplitAmounts,
      totals,
      isValid,
      accounts,
      sourceAccounts,
      allocationAccounts,
      sourceAccount,
      displayCurrency,
      precision,
      editor.journalDate,
      isSubmitting,
      setTotalAmount,
      currencyContext,
    ],
  );
}
