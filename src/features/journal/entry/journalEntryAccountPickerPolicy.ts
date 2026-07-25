import Account from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { getAllowedAccountTypes } from '@/src/utils/accountCategory';
import { AccountId, JournalEntryLine, TabType } from '@/src/types/domain';

type SplitRowPick = { id: string; accountId?: AccountId };

export function resolveJournalEntrySelectableAccounts(input: {
  accounts: Account[];
  activeLineId: string | null;
  activeMode: JournalEntryScreenMode;
  transactionType: TabType;
  lines: JournalEntryLine[];
}): Account[] {
  const { accounts, activeLineId, activeMode, transactionType, lines } = input;
  if (!activeLineId) return accounts;

  const modeTab =
    activeMode === 'split' ? 'expense' : activeMode === 'guided' ? transactionType : null;
  if (!modeTab) return accounts;

  const line = lines.find(l => l.id === activeLineId);
  const lineSide =
    line?.transactionType ??
    (activeLineId === SPLIT_SOURCE_LINE_ID ? TransactionType.CREDIT : TransactionType.DEBIT);

  const allowedTypes = getAllowedAccountTypes(modeTab, lineSide);
  const filtered = accounts.filter(a => allowedTypes.includes(a.accountType));

  return filtered.length > 0 ? filtered : accounts;
}

export function resolveJournalEntrySelectedAccountId(input: {
  activeMode: JournalEntryScreenMode;
  activeLineId: string | null;
  lines: JournalEntryLine[];
  splitSourceAccountId?: AccountId;
  splitRows: SplitRowPick[];
}): AccountId | undefined {
  const { activeMode, activeLineId, lines, splitSourceAccountId, splitRows } = input;
  if (activeMode === 'split' && activeLineId) {
    if (activeLineId === SPLIT_SOURCE_LINE_ID) {
      return splitSourceAccountId;
    }
    return splitRows.find(s => s.id === activeLineId)?.accountId;
  }
  return lines.find(l => l.id === activeLineId)?.accountId;
}
