import { CreateAccountIntent } from '@/src/features/accounts';
import type { AccountFields } from '@/src/types/domain';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { AccountId, AccountType } from '@/src/types/domain';
import {
  resolveJournalEntrySelectableAccounts,
  resolveJournalEntrySelectedAccountId,
} from '@/src/features/journal/entry/journalEntryAccountPickerPolicy';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo, useState } from 'react';

type SplitRowPick = { id: string; accountId?: AccountId };

export interface UseJournalEntryAccountPickerOptions {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  activeMode: JournalEntryScreenMode;
  /** Mode-agnostic apply; parent routes via switch(activeMode). */
  applyAccountToActiveLine: (lineId: string, accountId: AccountId) => void;
  /** Mode-local picker highlight override (e.g. split draft). */
  resolveModeSelectedAccountId?: (activeLineId: string) => AccountId | undefined;
  splitSourceAccountId?: AccountId;
  splitRows?: SplitRowPick[];
}

/**
 * AccountFields picker UI state — mode-agnostic.
 * Split / guided / advanced account application is injected via callback.
 */
export function useJournalEntryAccountPicker(options: UseJournalEntryAccountPickerOptions) {
  const {
    accounts,
    editor,
    activeMode,
    applyAccountToActiveLine,
    resolveModeSelectedAccountId,
    splitSourceAccountId,
    splitRows = [],
  } = options;

  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  const onSelectAccountRequest = useCallback(
    (idOrRole: string) => {
      const lineId = activeMode === 'split' ? idOrRole : editor.resolveActiveLineId(idOrRole);
      setActiveLineId(lineId);
      setShowAccountPicker(true);
    },
    [editor, activeMode],
  );

  const onCloseAccountPicker = useCallback(() => {
    setShowAccountPicker(false);
    setActiveLineId(null);
  }, []);

  const onAccountSelected = useCallback(
    (accountId: AccountId) => {
      if (activeLineId) {
        applyAccountToActiveLine(activeLineId, accountId);
      }
      onCloseAccountPicker();
    },
    [activeLineId, applyAccountToActiveLine, onCloseAccountPicker],
  );

  const onCreateAccountRequest = useCallback(
    (intent: CreateAccountIntent) => {
      onCloseAccountPicker();

      let inferredType: AccountType | undefined;
      const activeLine = editor.lines.find(l => l.id === activeLineId);

      if (activeMode === 'guided' && activeLine) {
        inferredType = getInferredAccountType(editor.transactionType, activeLine.transactionType);
      }

      AppNavigation.toAccountForm(undefined, {
        name: intent.suggestedName,
        type: intent.type || inferredType,
      });
    },
    [activeLineId, activeMode, editor.lines, editor.transactionType, onCloseAccountPicker],
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
    if (activeLineId && resolveModeSelectedAccountId) {
      const resolved = resolveModeSelectedAccountId(activeLineId);
      if (resolved !== undefined) return resolved;
    }
    return resolveJournalEntrySelectedAccountId({
      activeMode,
      activeLineId,
      lines: editor.lines,
      splitSourceAccountId,
      splitRows,
    });
  }, [
    activeMode,
    activeLineId,
    editor.lines,
    resolveModeSelectedAccountId,
    splitSourceAccountId,
    splitRows,
  ]);

  return {
    showAccountPicker,
    onSelectAccountRequest,
    onCloseAccountPicker,
    onAccountSelected,
    onCreateAccountRequest,
    selectableAccounts,
    selectedAccountId,
  };
}
