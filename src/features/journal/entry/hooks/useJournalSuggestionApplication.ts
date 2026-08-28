import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { analytics } from '@/src/services/analytics';
import { TransactionType } from '@/src/types/enums';
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import {
  isSimpleTargetAccountUnset,
  resolveTargetAccountIdForSimpleTab,
} from '@/src/services/journal/simpleJournalHelpers';
import type { useJournalEditor } from './useJournalEditor';
import type { JournalEntryScreenMode } from '../journalEntryPresentation';
import type { AccountFields } from '@/src/types/plainDtos';

export function useJournalSuggestionApplication(
  editor: ReturnType<typeof useJournalEditor>,
  accounts: AccountFields[],
  activeMode: JournalEntryScreenMode,
) {
  return (suggestion: JournalAutofillSuggestion) => {
    analytics.trackFeatureUsage('journal', 'suggestion_accepted', {
      has_target_account: !!suggestion.targetAccountId,
      target_account_type: suggestion.targetAccountType || 'none',
      mode: activeMode,
    });
    editor.setDescription(suggestion.description);
    if (activeMode !== 'basic') return;

    const sourceLine = editor.lines.find(l => l.transactionType === TransactionType.CREDIT);
    const destLine = editor.lines.find(l => l.transactionType === TransactionType.DEBIT);
    const sourceId = sourceLine?.accountId ?? EMPTY_ACCOUNT_ID;
    const destId = destLine?.accountId ?? EMPTY_ACCOUNT_ID;
    const tabType = editor.transactionType;
    if (!isSimpleTargetAccountUnset(tabType, sourceId, destId)) return;
    const targetAccountId = resolveTargetAccountIdForSimpleTab(suggestion, tabType);
    const account = targetAccountId && accounts.find(a => a.id === targetAccountId);
    if (!targetAccountId || !account) return;

    const line = tabType === 'income' ? sourceLine : destLine;
    if (line) {
      editor.updateLine(line.id, {
        accountId: targetAccountId,
        accountName: account.name,
        accountType: account.accountType,
        accountCurrency: account.currencyCode,
      });
    }
  };
}
