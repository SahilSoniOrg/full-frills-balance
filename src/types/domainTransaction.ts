import { JournalEntryLine, TabType } from '@/src/types/domainJournal';
import { AccountId, JournalId, TransactionId, WorkplaceId } from '@/src/types/ids';

/**
 * User-facing transaction intent. It is deliberately editable and may be incomplete
 * while the composer is collecting enough information to post.
 */
export interface TransactionIntent {
  description: string;
  amount?: string;
  date: string;
  notes?: string;
  type?: TabType;
  sourceAccountId?: AccountId;
  destinationAccountId?: AccountId;
  sourceExchangeRate?: string;
  destinationExchangeRate?: string;
  allocations?: TransactionAllocation[];
  sourceContext?: TransactionSourceContext;
}

/** A destination/category allocation in an intent. */
export interface TransactionAllocation {
  id?: string;
  accountId?: AccountId;
  amount: string;
  exchangeRate?: string;
  notes?: string;
}

export type TransactionSource =
  | 'dashboard'
  | 'activity'
  | 'account'
  | 'sms'
  | 'widget'
  | 'voice'
  | 'duplicate'
  | 'edit'
  | 'planned-payment'
  | 'manual';

/** Context preserved when a launcher hands work to the composer. */
export interface TransactionSourceContext {
  source: TransactionSource;
  workplaceId?: WorkplaceId;
  journalId?: JournalId;
  externalId?: string;
}

/** Validated accounting output. Persistence is intentionally outside this contract. */
export interface PostingPlan {
  lines: JournalEntryLine[];
  currencyCode: string;
  description: string;
  date: number;
  notes?: string;
}

/** Identity assigned after a posting plan has been persisted. */
export interface PostedJournal {
  journalId: JournalId;
  plan: PostingPlan;
}

export type TransactionDomainIssueCode =
  | 'missing_description'
  | 'missing_date'
  | 'invalid_date'
  | 'missing_amount'
  | 'invalid_amount'
  | 'missing_source_account'
  | 'missing_destination_account'
  | 'missing_allocation_account'
  | 'invalid_allocation_amount'
  | 'allocation_sum_mismatch'
  | 'unknown_account';

export interface TransactionDomainIssue {
  code: TransactionDomainIssueCode;
  message: string;
  path?: string;
  accountId?: AccountId;
}

export type TransactionResolution =
  | { resolved: true; plan: PostingPlan; issues: readonly [] }
  | { resolved: false; plan?: undefined; issues: TransactionDomainIssue[] };

export interface TransactionResolverAccount {
  id: AccountId;
  name: string;
  accountType: JournalEntryLine['accountType'];
  currencyCode: string;
}

export interface TransactionResolverContext {
  accounts: readonly TransactionResolverAccount[];
  currencyCode: string;
}

export type PostingPlanValidationCode =
  | 'missing_description'
  | 'missing_currency'
  | 'invalid_date'
  | 'too_few_lines'
  | 'missing_account'
  | 'unknown_account'
  | 'duplicate_line_id'
  | 'invalid_amount'
  | 'missing_debit'
  | 'missing_credit'
  | 'missing_exchange_rate'
  | 'invalid_exchange_rate'
  | 'account_metadata_mismatch'
  | 'unbalanced';

export interface PostingPlanValidationIssue {
  code: PostingPlanValidationCode;
  message: string;
  lineId?: TransactionId;
  accountId?: AccountId;
}

export interface PostingPlanValidationResult {
  valid: boolean;
  issues: PostingPlanValidationIssue[];
}
