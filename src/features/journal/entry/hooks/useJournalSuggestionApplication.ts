import type { AutopilotAppliedAccount } from '@/src/features/journal/entry/components/useSimpleFormExpansion';
import { analytics } from '@/src/services/analytics';
import { lineAccountPatch } from '@/src/services/journal/journalEditorHelpers';
import { AccountType, TransactionType } from '@/src/types/enums';
import { EMPTY_ACCOUNT_ID, TransactionId } from '@/src/types/ids';
import type { JournalSuggestion } from '@/src/types/journalSuggestions';
import type { AccountFields } from '@/src/types/plainDtos';
import type { JournalEntryScreenMode } from '../journalEntryPresentation';
import type { useJournalEditor } from './useJournalEditor';

export function useJournalSuggestionApplication(
  editor: ReturnType<typeof useJournalEditor>,
  accounts: AccountFields[],
  activeMode: JournalEntryScreenMode,
): (suggestion: JournalSuggestion) => AutopilotAppliedAccount | undefined {
  return (suggestion: JournalSuggestion) => {
    analytics.trackFeatureUsage('journal', 'suggestion_accepted', {
      has_target_account:
        suggestion.route.sources.length + suggestion.route.destinations.length > 0,
      target_account_type: 'route',
      mode: activeMode,
    });
    editor.setDescription(suggestion.description);

    const sourceIds = suggestion.route.sources.map(item => item.id);
    const destinationIds = suggestion.route.destinations.map(item => item.id);
    const routeSources = sourceIds
      .map(id => accounts.find(account => account.id === id))
      .filter((account): account is AccountFields => Boolean(account));
    const routeDestinations = destinationIds
      .map(id => accounts.find(account => account.id === id))
      .filter((account): account is AccountFields => Boolean(account));
    const hasCompleteRoute =
      routeSources.length === sourceIds.length &&
      routeDestinations.length === destinationIds.length;

    if (hasCompleteRoute && routeSources.length && routeDestinations.length) {
      if (activeMode === 'basic' && (routeSources.length !== 1 || routeDestinations.length !== 1))
        return;
      editor.setLines(current => {
        const maxId = current
          .map(line => Number(line.id))
          .filter(Number.isFinite)
          .reduce((max, id) => Math.max(max, id), 0);
        let nextId = maxId + 1;
        const makeLine = (
          account: AccountFields,
          transactionType: TransactionType,
          existing?: (typeof current)[number],
        ) => ({
          ...(existing ?? {
            id: String(nextId++) as TransactionId,
            accountId: EMPTY_ACCOUNT_ID,
            accountName: '',
            accountType: AccountType.ASSET,
            amount: '',
            transactionType,
            notes: '',
            exchangeRate: '',
          }),
          ...lineAccountPatch(account.id, account, account.accountType),
          transactionType,
        });

        const mergeSide = (
          transactionType: TransactionType,
          suggestedAccounts: AccountFields[],
        ) => {
          const existingLines = current.filter(line => line.transactionType === transactionType);
          const selectedIds = new Set(
            existingLines
              .filter(line => line.accountId && line.accountId !== EMPTY_ACCOUNT_ID)
              .map(line => line.accountId),
          );
          const unselectedSuggestions = suggestedAccounts.filter(
            account => !selectedIds.has(account.id),
          );
          let suggestionIndex = 0;
          const merged = existingLines.map(line => {
            if (line.accountId && line.accountId !== EMPTY_ACCOUNT_ID) return line;
            const account = unselectedSuggestions[suggestionIndex++];
            return account ? makeLine(account, transactionType, line) : line;
          });
          // Preserve selected accounts and only append rows the active form can show.
          const allowsMultipleLines =
            activeMode === 'expert' ||
            (activeMode === 'allocation' && transactionType === TransactionType.DEBIT);
          while (
            suggestionIndex < unselectedSuggestions.length &&
            (allowsMultipleLines || merged.length === 0)
          ) {
            merged.push(makeLine(unselectedSuggestions[suggestionIndex++], transactionType));
          }
          return merged;
        };

        const creditLines = mergeSide(TransactionType.CREDIT, routeSources);
        const debitLines = mergeSide(TransactionType.DEBIT, routeDestinations);
        return [...debitLines, ...creditLines];
      });
      return;
    }

    return;
  };
}
