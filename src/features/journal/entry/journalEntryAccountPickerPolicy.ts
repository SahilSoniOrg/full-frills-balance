import type { AccountFields } from '@/src/types/plainDtos';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { JournalEntryLine, TabType } from '@/src/types/domainJournal';

import {
  filterGuidedLegAccounts,
  filterToLeafAccounts,
} from '@/src/services/journal/guidedJournalAccountEligibility';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';

type SplitRowPick = { id: string; accountId?: AccountId };

export function buildJournalLineAccountPatch(
  accountId: AccountId,
  account: AccountFields | undefined,
): Partial<JournalEntryLine> {
  return {
    accountId,
    accountName: account?.name ?? '',
    accountType: account?.accountType ?? AccountType.ASSET,
    accountCurrency: account?.currencyCode,
  };
}

/** Apply a picker choice directly to a journal line (guided / advanced shell path). */
export function applyJournalLineAccountSelection(input: {
  lineId: string;
  accountId: AccountId;
  accounts: AccountFields[];
  updateLine: (lineId: string, patch: Partial<JournalEntryLine>) => void;
}): void {
  const { lineId, accountId, accounts, updateLine } = input;
  if (!lineId || !accountId || accountId === EMPTY_ACCOUNT_ID) return;
  const account = accounts.find(item => item.id === accountId);
  updateLine(lineId, buildJournalLineAccountPatch(accountId, account));
}

export function resolveJournalEntrySelectableAccounts(input: {
  accounts: AccountFields[];
  activeLineId: string | null;
  activeMode: JournalEntryScreenMode;
  transactionType: TabType;
  lines: JournalEntryLine[];
}): AccountFields[] {
  const { accounts, activeLineId, activeMode, transactionType, lines } = input;
  if (!activeLineId) return accounts;

  const modeTab =
    activeMode === 'allocation' ? 'expense' : activeMode === 'basic' ? transactionType : null;
  if (!modeTab) return accounts;

  const line = lines.find(l => l.id === activeLineId);
  const lineSide =
    line?.transactionType ??
    (activeLineId === SPLIT_SOURCE_LINE_ID ? TransactionType.CREDIT : TransactionType.DEBIT);

  const leafAccounts = filterToLeafAccounts(accounts);
  return filterGuidedLegAccounts(leafAccounts, modeTab, lineSide);
}

export function resolveJournalEntrySelectedAccountId(input: {
  activeMode: JournalEntryScreenMode;
  activeLineId: string | null;
  lines: JournalEntryLine[];
  splitSourceAccountId?: AccountId;
  splitRows: SplitRowPick[];
}): AccountId | undefined {
  const { activeMode, activeLineId, lines, splitSourceAccountId, splitRows } = input;
  if (activeMode === 'allocation' && activeLineId) {
    if (activeLineId === SPLIT_SOURCE_LINE_ID) {
      return splitSourceAccountId;
    }
    return splitRows.find(s => s.id === activeLineId)?.accountId;
  }
  return lines.find(l => l.id === activeLineId)?.accountId;
}
