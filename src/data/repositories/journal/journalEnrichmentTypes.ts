import { AccountId, JournalId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';

/** Row shape returned by `journalEnrichmentQueries.getEnrichmentDataRaw`. */
export type JournalEnrichmentRow = {
  journal_id: JournalId;
  account_id: AccountId;
  amount: number;
  transaction_type: TransactionType;
  account_name: string;
  account_type: AccountType;
  account_icon?: string;
};

/** Aggregated autocomplete suggestion with dominant historical target account */
export type JournalAutofillSuggestion = {
  description: string;
  count: number;
  /** Historical share of matching journals represented by the suggested target account. */
  confidence?: number;
  targetAccountId?: AccountId;
  targetAccountName?: string;
  targetAccountType?: AccountType;
};
