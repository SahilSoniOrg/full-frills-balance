import { AccountId, AccountType, JournalId, TransactionType } from '@/src/types/domain';

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
