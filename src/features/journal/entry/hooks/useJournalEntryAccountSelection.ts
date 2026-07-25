import { CreateAccountIntent } from '@/src/components/common/AccountPickerModal';
import Account, { AccountType } from '@/src/data/models/Account';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { AccountId } from '@/src/types/domain';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { TransactionType } from '@/src/data/models/Transaction';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { getAllowedAccountTypes, getInferredAccountType } from '@/src/utils/accountCategory';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo, useState } from 'react';

export interface UseJournalEntryAccountSelectionOptions {
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  entryScreenMode?: JournalEntryScreenMode;
}

export function useJournalEntryAccountSelection(options: UseJournalEntryAccountSelectionOptions) {
  const { accounts, editor, entryScreenMode } = options;

  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  const onSelectAccountRequest = useCallback(
    (idOrRole: string) => {
      setActiveLineId(editor.resolveActiveLineId(idOrRole));
      setShowAccountPicker(true);
    },
    [editor],
  );

  const onCloseAccountPicker = useCallback(() => {
    setShowAccountPicker(false);
    setActiveLineId(null);
  }, []);

  const onAccountSelected = useCallback(
    (accountId: AccountId) => {
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
    [accounts, activeLineId, editor],
  );

  const onCreateAccountRequest = useCallback(
    (intent: CreateAccountIntent) => {
      onCloseAccountPicker();

      let inferredType: AccountType | undefined;
      const activeLine = editor.lines.find(l => l.id === activeLineId);

      if (editor.isGuidedMode && activeLine) {
        inferredType = getInferredAccountType(editor.transactionType, activeLine.transactionType);
      }

      AppNavigation.toAccountForm(undefined, {
        name: intent.suggestedName,
        type: intent.type || inferredType,
      });
    },
    [activeLineId, editor.isGuidedMode, editor.transactionType, editor.lines, onCloseAccountPicker],
  );

  const selectableAccounts = useMemo(() => {
    if (!activeLineId) return accounts;

    if (entryScreenMode === 'split') {
      const line = editor.lines.find(l => l.id === activeLineId);
      if (!line) return accounts;

      if (line.id === SPLIT_SOURCE_LINE_ID || line.transactionType === TransactionType.CREDIT) {
        const allowedTypes = getAllowedAccountTypes('expense', TransactionType.CREDIT);
        const filtered = accounts.filter(a => allowedTypes.includes(a.accountType));
        return filtered.length > 0 ? filtered : accounts;
      }

      const allowedTypes = getAllowedAccountTypes('expense', TransactionType.DEBIT);
      const filtered = accounts.filter(a => allowedTypes.includes(a.accountType));
      return filtered.length > 0 ? filtered : accounts;
    }

    if (editor.isGuidedMode) {
      const type = editor.transactionType;
      const line = editor.lines.find(l => l.id === activeLineId);
      if (!line) return accounts;

      const allowedTypes = getAllowedAccountTypes(type, line.transactionType);
      const filtered = accounts.filter(a => allowedTypes.includes(a.accountType));

      return filtered.length > 0 ? filtered : accounts;
    }

    return accounts;
  }, [
    accounts,
    activeLineId,
    editor.isGuidedMode,
    editor.transactionType,
    editor.lines,
    entryScreenMode,
  ]);

  return {
    showAccountPicker,
    activeLineId,
    onSelectAccountRequest,
    onCloseAccountPicker,
    onAccountSelected,
    onCreateAccountRequest,
    selectableAccounts,
  };
}
