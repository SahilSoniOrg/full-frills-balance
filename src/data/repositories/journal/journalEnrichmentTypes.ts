import { AccountId, JournalId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';
import type { JournalSuggestion } from '@/src/types/journalSuggestions';

export type {
  JournalSuggestion,
  JournalSuggestionAccount as JournalAutofillAccount,
  JournalSuggestionPage,
} from '@/src/types/journalSuggestions';

/** Row shape returned by `journalEnrichmentQueries.getEnrichmentDataRaw`. */
export type JournalEnrichmentRow = {
  journal_id: JournalId;
  account_id: AccountId;
  amount: number;
  account_currency_code: string;
  transaction_type: TransactionType;
  account_name: string;
  account_type: AccountType;
  account_icon?: string;
};

/** @deprecated Use JournalSuggestion. */
export type JournalAutofillSuggestion = JournalSuggestion;
