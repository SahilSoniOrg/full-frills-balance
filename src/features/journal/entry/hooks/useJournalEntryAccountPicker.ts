import { CreateAccountIntent } from '@/src/components/common/AccountPickerModal';
import Account, { AccountType } from '@/src/data/models/Account';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import {
  resolveJournalEntrySelectableAccounts,
  resolveJournalEntrySelectedAccountId,
} from '@/src/features/journal/entry/journalEntryAccountPickerPolicy';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { AccountId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo, useState } from 'react';

export interface UseJournalEntryAccountPickerOptions {
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  activeMode: JournalEntryScreenMode;
}

/**
 * Account picker UI + split editor in one hook so split account selection
 * can call splitEditor directly (no render-time ref bridge).
 */
export function useJournalEntryAccountPicker(options: UseJournalEntryAccountPickerOptions) {
  const { accounts, editor, activeMode } = options;

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

  const splitEditor = useSplitJournalEditor({
    accounts,
    editor,
    onSelectAccountRequest,
    isActive: activeMode === 'split',
  });

  const onCloseAccountPicker = useCallback(() => {
    setShowAccountPicker(false);
    setActiveLineId(null);
  }, []);

  const onAccountSelected = useCallback(
    (accountId: AccountId) => {
      if (activeMode === 'split' && activeLineId) {
        if (activeLineId === SPLIT_SOURCE_LINE_ID) {
          splitEditor.setSourceAccountId(accountId);
        } else {
          splitEditor.updateSplitRow(activeLineId, { accountId });
        }
        onCloseAccountPicker();
        return;
      }

      if (activeLineId) {
        const account = accounts.find(a => a.id === accountId);
        if (account) {
          editor.updateLine(activeLineId, {
            accountId,
            accountName: account.name,
            accountType: account.accountType,
            accountCurrency: account.currencyCode,
          });
        }
      }
      setShowAccountPicker(false);
      setActiveLineId(null);
    },
    [accounts, activeLineId, activeMode, editor, onCloseAccountPicker, splitEditor],
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
        splitSourceAccountId: splitEditor.sourceAccountId,
        splitRows: splitEditor.splits,
      }),
    [activeMode, activeLineId, editor.lines, splitEditor.sourceAccountId, splitEditor.splits],
  );

  return {
    splitEditor,
    showAccountPicker,
    onSelectAccountRequest,
    onCloseAccountPicker,
    onAccountSelected,
    onCreateAccountRequest,
    selectableAccounts,
    selectedAccountId,
  };
}
