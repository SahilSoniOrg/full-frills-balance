import type { AutopilotAppliedAccount } from '@/src/features/journal/entry/components/useSimpleFormExpansion';
import { analytics } from '@/src/services/analytics';
import { lineAccountPatch } from '@/src/services/journal/journalEditorHelpers';
import { TransactionType } from '@/src/types/enums';
import { asTransactionId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import type { JournalEntryLine } from '@/src/types/domainJournal';
import type { JournalSuggestion, JournalSuggestionAccount } from '@/src/types/journalSuggestions';
import type { AccountFields } from '@/src/types/plainDtos';
import type { JournalEntryScreenMode } from '../journalEntryPresentation';
import type { useJournalEditor } from './useJournalEditor';

export function applyJournalSuggestion(
  editor: Pick<ReturnType<typeof useJournalEditor>, 'setDescription' | 'setLines'>,
  accounts: AccountFields[],
  activeMode: JournalEntryScreenMode,
  suggestion: JournalSuggestion,
): AutopilotAppliedAccount | undefined {
  analytics.trackFeatureUsage('journal', 'suggestion_accepted', {
    has_target_account: suggestion.route.sources.length + suggestion.route.destinations.length > 0,
    mode: activeMode,
  });
  editor.setDescription(suggestion.description);

  const { sources, destinations } = suggestion.route;
  if (!sources.length || !destinations.length) return;
  if (activeMode === 'basic' && (sources.length !== 1 || destinations.length !== 1)) return;

  const resolveAccounts = (route: JournalSuggestionAccount[]) =>
    route
      .map(item => accounts.find(account => account.id === item.id))
      .filter((account): account is AccountFields => Boolean(account));
  const routeSources = resolveAccounts(sources);
  const routeDestinations = resolveAccounts(destinations);
  if (routeSources.length !== sources.length || routeDestinations.length !== destinations.length)
    return;

  editor.setLines(current => {
    let nextId =
      current
        .map(line => Number(line.id))
        .filter(Number.isFinite)
        .reduce((max, id) => Math.max(max, id), 0) + 1;
    const makeLine = (
      account: AccountFields,
      transactionType: TransactionType,
      existing?: JournalEntryLine,
    ): JournalEntryLine => ({
      amount: '',
      notes: '',
      exchangeRate: '',
      ...existing,
      id: existing?.id ?? asTransactionId(String(nextId++)),
      ...lineAccountPatch(account.id, account, account.accountType),
      transactionType,
    });

    const mergeSide = (transactionType: TransactionType, suggestedAccounts: AccountFields[]) => {
      const existingLines = current.filter(line => line.transactionType === transactionType);
      const selectedIds = new Set(existingLines.map(line => line.accountId));
      const pending = suggestedAccounts.filter(account => !selectedIds.has(account.id));
      const merged = existingLines.map(line => {
        if (line.accountId && line.accountId !== EMPTY_ACCOUNT_ID) return line;
        const account = pending.shift();
        return account ? makeLine(account, transactionType, line) : line;
      });
      const allowsMultipleLines =
        activeMode === 'expert' ||
        (activeMode === 'allocation' && transactionType === TransactionType.DEBIT);
      for (const account of pending) {
        if (!allowsMultipleLines && merged.length > 0) break;
        merged.push(makeLine(account, transactionType));
      }
      return merged;
    };

    const creditLines = mergeSide(TransactionType.CREDIT, routeSources);
    const debitLines = mergeSide(TransactionType.DEBIT, routeDestinations);
    return [...debitLines, ...creditLines];
  });
}
