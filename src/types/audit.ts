import { IconName } from '@/src/types/domainIcons';
import { AccountId } from '@/src/types/ids';
import { AccountSubtype, AccountType, TransactionType } from '@/src/types/enums';

/**
 * Audit State Interfaces - Used for type-safe reversion logic
 */

export interface TransactionAuditState {
  accountId: AccountId;
  amount: number;
  transactionType: TransactionType;
  notes?: string;
  exchangeRate?: number;
  currencyCode?: string;
}

export interface AccountAuditState {
  name?: string;
  accountType?: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode?: string;
  description?: string | null;
  icon?: IconName | null;
  color?: string | null;
  parentAccountId?: AccountId | null;
  orderNum?: number | null;
  reconciledAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  deletedAt?: Date | null;
  /** null = explicitly not archived. Persisted audits use ISO strings; normalized to Date at revert. */
  archivedAt?: Date | null;
  restoredAt?: Date;
}

/**
 * Maps a Transaction model or object to a TransactionAuditState for logging.
 */
export function mapTransactionToAudit(t: TransactionAuditState): TransactionAuditState {
  return {
    accountId: t.accountId,
    amount: t.amount,
    transactionType: t.transactionType,
    notes: t.notes || undefined,
    exchangeRate: t.exchangeRate || undefined,
    currencyCode: t.currencyCode || undefined,
  };
}
