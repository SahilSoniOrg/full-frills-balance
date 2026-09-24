import type { AccountFields } from '@/src/types/plainDtos';
import { TransactionType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import { JournalEntryLine, TabType } from '@/src/types/domainJournal';

import { lineAccountPatch } from '@/src/services/journal/journalEditorHelpers';
import { shouldApplyLastUsedAccountDefault } from '@/src/services/journal/simpleJournalHelpers';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { preferences } from '@/src/services/preferences';
import { useEffect, useRef } from 'react';
import { useJournalEditor } from './useJournalEditor';

interface UseSimpleJournalAccountSyncProps {
  accounts: AccountFields[];
  editor: Pick<
    ReturnType<typeof useJournalEditor>,
    'isGuidedMode' | 'isEdit' | 'setLines' | 'lines' | 'updateLines'
  >;
  type: TabType;
  sourceId: AccountId;
  destinationId: AccountId;
  transactionAccounts: AccountFields[];
}

/** Keeps guided account defaults and line metadata aligned with the account list. */
export function useSimpleJournalAccountSync({
  accounts,
  editor,
  type,
  sourceId,
  destinationId,
  transactionAccounts,
}: UseSimpleJournalAccountSyncProps): void {
  const journalNav = preferences.journalNav;
  const initializedTabTypesRef = useRef<Set<TabType>>(new Set());

  useEffect(() => {
    if (!editor.isGuidedMode || editor.isEdit) return;
    if (transactionAccounts.length === 0) return;
    if (initializedTabTypesRef.current.has(type)) return;

    initializedTabTypesRef.current.add(type);

    const lastSourceId = journalNav.lastUsedSourceAccountId;
    const lastDestId = journalNav.lastUsedDestinationAccountId;
    const newSourceId =
      shouldApplyLastUsedAccountDefault(type, 'source', sourceId) &&
      lastSourceId &&
      transactionAccounts.some(account => account.id === lastSourceId)
        ? lastSourceId
        : undefined;
    const newDestId =
      shouldApplyLastUsedAccountDefault(type, 'destination', destinationId) &&
      lastDestId &&
      transactionAccounts.some(account => account.id === lastDestId)
        ? lastDestId
        : undefined;

    if (!newSourceId && !newDestId) return;

    const withAccount = (line: JournalEntryLine, accountId: AccountId): JournalEntryLine => ({
      ...line,
      ...lineAccountPatch(
        accountId,
        accounts.find(item => item.id === accountId),
        getInferredAccountType(type, line.transactionType),
      ),
    });

    editor.setLines(lines =>
      lines.map(line => {
        if (line.transactionType === TransactionType.CREDIT && newSourceId) {
          return withAccount(line, newSourceId);
        }
        if (line.transactionType === TransactionType.DEBIT && newDestId) {
          return withAccount(line, newDestId);
        }
        return line;
      }),
    );
  }, [type, transactionAccounts, destinationId, sourceId, accounts, editor, journalNav]);

  useEffect(() => {
    if (accounts.length === 0) return;

    const updates: Record<string, Partial<JournalEntryLine>> = {};
    editor.lines.forEach(line => {
      if (!line.accountId || line.accountName) return;
      const account = accounts.find(item => item.id === line.accountId);
      if (!account) return;
      updates[line.id] = lineAccountPatch(line.accountId, account, line.accountType);
    });

    if (Object.keys(updates).length > 0) editor.updateLines(updates);
  }, [accounts, editor.lines, editor]);
}
