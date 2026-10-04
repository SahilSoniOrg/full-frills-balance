import { AccountId, JournalId, TransactionId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';

/** Row shape returned by `journalEnrichmentQueries.getEnrichmentDataRaw`. */
export type JournalEnrichmentRow = {
  journal_id: JournalId;
  account_id: AccountId;
  transaction_id?: TransactionId;
  exchange_rate?: number | null;
  amount: number;
  account_currency_code: string;
  transaction_type: TransactionType;
  account_name: string;
  account_type: AccountType;
  account_icon?: string;
  account_color?: string | null;
};
