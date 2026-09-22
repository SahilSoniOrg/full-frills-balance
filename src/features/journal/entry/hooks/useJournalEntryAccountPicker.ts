import type { CreateAccountIntent } from '@/src/components/account-selection';
import type { AccountFields } from '@/src/types/plainDtos';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { AppConfig } from '@/src/constants';
import { AccountId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';
import {
  resolveJournalEntrySelectableAccounts,
  resolveJournalEntrySelectedAccountId,
} from '@/src/features/journal/entry/journalEntryAccountPickerPolicy';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { AppNavigation } from '@/src/utils/navigation';
import type { AccountRole } from '@/src/types/domainJournal';
import type { useBulkJournalEditor } from './useBulkJournalEditor';
import { registerAccountCreationReturn } from '@/src/utils/accountCreationReturn';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SplitRowPick = { id: string; accountId?: AccountId };

export type JournalEntryAccountPickerRequestOptions = {
  /** Continue the guided post-amount flow with the complementary account side. */
  autoAdvance?: boolean;
};

export interface UseJournalEntryAccountPickerOptions {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  activeMode: JournalEntryScreenMode;
  /** Mode-agnostic apply; the shell owns the canonical draft. */
  applyAccountToActiveLine: (lineId: string, accountId: AccountId) => void;
  splitSourceAccountId?: AccountId;
  splitRows?: SplitRowPick[];
  batchEditor?: ReturnType<typeof useBulkJournalEditor>;
}

/**
 * AccountFields picker UI state — mode-agnostic.
 * Account application is injected by the composer shell; this hook owns only picker UI state.
 */
export function useJournalEntryAccountPicker(options: UseJournalEntryAccountPickerOptions) {
  const {
    accounts,
    editor,
    activeMode,
    applyAccountToActiveLine,
    splitSourceAccountId,
    splitRows = [],
    batchEditor,
  } = options;

  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const autoAdvanceRef = useRef(false);
  const pendingNextLineIdRef = useRef<string | null>(null);
  const nextPickerFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNextPickerFallback = useCallback(() => {
    if (nextPickerFallbackTimerRef.current) {
      clearTimeout(nextPickerFallbackTimerRef.current);
      nextPickerFallbackTimerRef.current = null;
    }
  }, []);

  const openPendingNextPicker = useCallback(() => {
    const nextLineId = pendingNextLineIdRef.current;
    if (!nextLineId) return;

    pendingNextLineIdRef.current = null;
    clearNextPickerFallback();
    setActiveLineId(nextLineId);
    setShowAccountPicker(true);
  }, [clearNextPickerFallback]);

  useEffect(
    () => () => {
      clearNextPickerFallback();
    },
    [clearNextPickerFallback],
  );

  const onSelectAccountRequest = useCallback(
    (idOrRole: string, requestOptions?: JournalEntryAccountPickerRequestOptions) => {
      const lineId = activeMode === 'allocation' ? idOrRole : editor.resolveActiveLineId(idOrRole);
      autoAdvanceRef.current = activeMode === 'basic' && requestOptions?.autoAdvance === true;
      setActiveLineId(lineId);
      setShowAccountPicker(true);
    },
    [editor, activeMode],
  );

  const closeAccountPicker = useCallback(() => {
    setShowAccountPicker(false);
    setActiveLineId(null);
  }, []);

  const onCloseAccountPicker = useCallback(() => {
    autoAdvanceRef.current = false;
    pendingNextLineIdRef.current = null;
    clearNextPickerFallback();
    closeAccountPicker();
  }, [clearNextPickerFallback, closeAccountPicker]);

  const onAccountSelected = useCallback(
    (accountId: AccountId) => {
      const selectedLineId = activeLineId;
      const shouldAutoAdvance = activeMode === 'basic' && autoAdvanceRef.current;
      const selectedLine = editor.lines.find(line => line.id === selectedLineId);
      const nextRole =
        selectedLine?.transactionType === TransactionType.CREDIT ? 'destination' : 'source';
      const nextLineId = shouldAutoAdvance ? editor.getLineIdByRole(nextRole) : undefined;

      if (selectedLineId) {
        applyAccountToActiveLine(selectedLineId, accountId);
      }

      autoAdvanceRef.current = false;
      pendingNextLineIdRef.current = nextLineId ?? null;
      closeAccountPicker();

      if (nextLineId) {
        // Native iOS modals cannot present a second modal until the first one
        // has finished dismissing. onDismiss is the primary handoff; this is
        // a fallback for test/web modal implementations that omit it.
        clearNextPickerFallback();
        nextPickerFallbackTimerRef.current = setTimeout(openPendingNextPicker, 450);
      }
    },
    [
      activeLineId,
      activeMode,
      applyAccountToActiveLine,
      clearNextPickerFallback,
      closeAccountPicker,
      editor,
      openPendingNextPicker,
    ],
  );

  const navigateToAccountForm = useCallback(
    (intent: CreateAccountIntent, lineId?: string, returnToken?: string) => {
      let inferredType: AccountType | undefined;
      const activeLine = editor.lines.find(l => l.id === lineId);

      if (activeMode === 'basic' && activeLine) {
        inferredType = getInferredAccountType(editor.transactionType, activeLine.transactionType);
      }

      AppNavigation.toAccountForm(undefined, {
        name: intent.suggestedName,
        type: intent.type || inferredType,
        returnToken,
      });
    },
    [activeMode, editor.lines, editor.transactionType],
  );

  const onCreateAccountRequest = useCallback(
    (intent: CreateAccountIntent) => {
      const lineId = activeLineId ?? undefined;
      const returnToken = lineId
        ? registerAccountCreationReturn(accountId => {
            applyAccountToActiveLine(lineId, accountId);
          })
        : undefined;
      onCloseAccountPicker();
      navigateToAccountForm(intent, lineId, returnToken);
    },
    [activeLineId, applyAccountToActiveLine, navigateToAccountForm, onCloseAccountPicker],
  );

  const onCreateAccountRequestForRole = useCallback(
    (role: AccountRole, intent: CreateAccountIntent) => {
      const lineId = editor.getLineIdByRole(role);
      const returnToken = lineId
        ? registerAccountCreationReturn(accountId => {
            applyAccountToActiveLine(lineId, accountId);
          })
        : undefined;
      navigateToAccountForm(intent, lineId, returnToken);
    },
    [applyAccountToActiveLine, editor, navigateToAccountForm],
  );

  const onCreateAccountRequestForBatchRow = useCallback(
    (rowId: string, role: AccountRole, intent: CreateAccountIntent) => {
      const row = batchEditor?.rows.find(item => item.id === rowId);
      if (!row || !batchEditor) return;

      const returnToken = registerAccountCreationReturn(accountId => {
        if (role === 'source') {
          batchEditor.rowActions.setSourceAccount(rowId, accountId);
        } else {
          batchEditor.rowActions.setDestinationAccount(rowId, accountId);
        }
      });

      const side = role === 'source' ? TransactionType.CREDIT : TransactionType.DEBIT;
      AppNavigation.toAccountForm(undefined, {
        name: intent.suggestedName,
        type: intent.type || getInferredAccountType(row.transactionType, side),
        returnToken,
      });
    },
    [batchEditor],
  );

  const onCreateAccountRequestForSplitRow = useCallback(
    (rowId: string, role: AccountRole, intent: CreateAccountIntent) => {
      const row = splitRows.find(item => item.id === rowId);
      // The source account belongs to the split entry, not to an allocation
      // row. It must remain creatable even when the last allocation row was
      // removed or an older draft loads without one.
      if (role !== 'source' && !row) return;

      const lineId = role === 'source' ? SPLIT_SOURCE_LINE_ID : rowId;
      const side = role === 'source' ? TransactionType.CREDIT : TransactionType.DEBIT;
      const returnToken = registerAccountCreationReturn(accountId => {
        applyAccountToActiveLine(lineId, accountId);
      });

      AppNavigation.toAccountForm(undefined, {
        name: intent.suggestedName,
        type: intent.type || getInferredAccountType(editor.transactionType, side),
        returnToken,
      });
    },
    [applyAccountToActiveLine, editor.transactionType, splitRows],
  );

  const selectableAccounts = useMemo(
    () =>
      resolveJournalEntrySelectableAccounts({
        accounts,
        activeLineId,
        activeMode,
        transactionType: editor.transactionType,
        lines: editor.lines,
      }),
    [accounts, activeLineId, activeMode, editor.transactionType, editor.lines],
  );

  const selectedAccountId = useMemo(() => {
    return resolveJournalEntrySelectedAccountId({
      activeMode,
      activeLineId,
      lines: editor.lines,
      splitSourceAccountId,
      splitRows,
    });
  }, [activeMode, activeLineId, editor.lines, splitSourceAccountId, splitRows]);

  const accountPickerTitle = useMemo(() => {
    if (activeMode !== 'basic' || !activeLineId) return 'Select Account';

    const activeLine = editor.lines.find(line => line.id === activeLineId);
    const isCategorySelection =
      (editor.transactionType === 'expense' &&
        activeLine?.transactionType === TransactionType.DEBIT) ||
      (editor.transactionType === 'income' &&
        activeLine?.transactionType === TransactionType.CREDIT);

    return isCategorySelection
      ? AppConfig.strings.transactionFlow.simpleEntry.chooseCategory
      : AppConfig.strings.transactionFlow.simpleEntry.chooseAccount;
  }, [activeLineId, activeMode, editor.lines, editor.transactionType]);

  return {
    showAccountPicker,
    onSelectAccountRequest,
    onCloseAccountPicker,
    onAccountSelected,
    onCreateAccountRequest,
    onCreateAccountRequestForRole,
    onCreateAccountRequestForBatchRow,
    onCreateAccountRequestForSplitRow,
    selectableAccounts,
    selectedAccountId,
    accountPickerTitle,
    onAccountPickerDismiss: openPendingNextPicker,
  };
}
