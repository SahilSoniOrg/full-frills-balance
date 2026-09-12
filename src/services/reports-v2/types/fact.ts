import type {
  AccountSubtype,
  AccountType,
  JournalDisplayType,
  JournalStatus,
  SemanticType,
  TransactionType,
} from '@/src/types/enums';
import type {
  AccountId,
  JournalId,
  PlannedPaymentId,
  TransactionId,
  WorkplaceId,
} from '@/src/types/ids';

/**
 * Immutable, enriched read-side representation of one journal line.
 * Aggregation must happen after these facts are created so drill-down and
 * audit checks retain journal and line identity.
 */
export interface ReportingFact {
  readonly workplaceId: WorkplaceId;
  readonly journalId: JournalId;
  readonly transactionId: TransactionId;
  readonly journalDate: number;
  readonly journalStatus: JournalStatus;

  readonly accountId: AccountId;
  readonly accountType: AccountType;
  readonly accountSubtype?: AccountSubtype;
  /** Root-to-leaf account path. It always includes `accountId`. */
  readonly accountPath: readonly AccountId[];
  readonly parentAccountId?: AccountId;
  readonly isLeafAccount: boolean;

  readonly transactionType: TransactionType;
  readonly amount: number;
  readonly currencyCode: string;
  /** Flow amount converted with the historical rate into the target currency. */
  readonly historicalBaseAmount?: number;

  /** Signed balance effect: positive increases the account's natural balance. */
  readonly signedBalanceDelta: number;
  readonly journalDisplayType: JournalDisplayType;
  readonly semanticType?: SemanticType;

  readonly description?: string;
  readonly notes?: string;
  readonly plannedPaymentId?: PlannedPaymentId;
}
