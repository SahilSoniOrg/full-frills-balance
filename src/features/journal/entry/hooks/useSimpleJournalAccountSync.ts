import Account, { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { shouldApplyLastUsedAccountDefault } from '@/src/services/journal/simpleJournalHelpers';
import { AccountId, JournalEntryLine, TabType } from '@/src/types/domain';
import { preferences } from '@/src/utils/preferences';
import { useEffect } from 'react';
import { useJournalEditor } from './useJournalEditor';

interface UseSimpleJournalAccountSyncProps {
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  type: TabType;
  sourceId: AccountId;
  destinationId: AccountId;
  transactionAccounts: Account[];
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

  useEffect(() => {
    if (!editor.isGuidedMode || editor.isEdit) return;

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

    editor.setLines(lines =>
      lines.map(line => {
        if (line.transactionType === TransactionType.CREDIT && newSourceId) {
          const account = accounts.find(item => item.id === newSourceId);
          return withAccountDetails(line, newSourceId, account);
        }
        if (line.transactionType === TransactionType.DEBIT && newDestId) {
          const account = accounts.find(item => item.id === newDestId);
          return withAccountDetails(line, newDestId, account);
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
      updates[line.id] = {
        accountName: account.name,
        accountType: account.accountType,
        accountCurrency: account.currencyCode,
      };
    });

    if (Object.keys(updates).length > 0) editor.updateLines(updates);
  }, [accounts, editor.lines, editor]);
}

function withAccountDetails(
  line: JournalEntryLine,
  accountId: AccountId,
  account: Account | undefined,
): JournalEntryLine {
  return {
    ...line,
    accountId,
    accountName: account?.name || '',
    accountType: account?.accountType || AccountType.ASSET,
    accountCurrency: account?.currencyCode,
  };
}
