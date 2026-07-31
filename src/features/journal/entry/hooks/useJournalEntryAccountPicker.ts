import { CreateAccountIntent } from '@/src/components/common/AccountPickerModal';
import Account, { AccountType } from '@/src/data/models/Account';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import {
  resolveJournalEntrySelectableAccounts,
  resolveJournalEntrySelectedAccountId,
} from '@/src/features/journal/entry/journalEntryAccountPickerPolicy';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { AccountId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo, useState } from 'react';

type SplitRowPick = { id: string; accountId?: AccountId };

export interface UseJournalEntryAccountPickerOptions {
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  activeMode: JournalEntryScreenMode;
  /** Split draft ids for picker highlight (owned by split editor, not this hook). */
  splitSourceAccountId?: AccountId;
  splitRows?: SplitRowPick[];
  /** Mode-agnostic apply; parent routes to split editor or core editor lines. */
  applyAccountToActiveLine: (lineId: string, accountId: AccountId) => void;
}

/**
 * Account picker UI state — mode-agnostic.
 * Split / guided / advanced account application is injected via callback.
 */
export function useJournalEntryAccountPicker(options: UseJournalEntryAccountPickerOptions) {
  const {
    accounts,
    editor,
    activeMode,
    splitSourceAccountId,
    splitRows = [],
    applyAccountToActiveLine,
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

  const selectedAccountId = useMemo(
    () =>
      resolveJournalEntrySelectedAccountId({
        activeMode,
        activeLineId,
        lines: editor.lines,
        splitSourceAccountId,
        splitRows,
      }),
    [activeMode, activeLineId, editor.lines, splitSourceAccountId, splitRows],
  );

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
