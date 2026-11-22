import type { IconName } from '@/src/types/domainIcons';
import type { AccountSubtype, AccountType } from '@/src/types/enums';
import type {
  AccountId,
  BudgetId,
  JournalId,
  PlannedPaymentId,
  WorkplaceId,
} from '@/src/types/ids';
import type { PlannedPaymentCommandInput } from '@/src/services/planned-payment/plannedPaymentCommandInputs';

export type CashClarityPublicationOutcome = {
  readonly workplaceId: WorkplaceId;
  readonly status: 'published' | 'already_published';
};

export type CashClarityPublicationErrorCode =
  | 'invalid_input'
  | 'missing_spendable_account'
  | 'ambiguous_existing_publication'
  | 'incomplete_publication'
  | 'finalization_failed'
  | 'save_failed';

export class CashClarityPublicationError extends Error {
  constructor(
    readonly code: CashClarityPublicationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CashClarityPublicationError';
  }
}

/** Receipt payload used to verify and replay an already-published setup. */
export type CashClarityPublicationManifest = {
  operationId: string;
  accountIds: string[];
  journalIds: string[];
  plannedPaymentIds: string[];
  budgetIds: string[];
  budgetScopeIds: string[];
  balanceRebuildAccountIds?: string[];
  balanceRebuildFromDate?: number | null;
};

export interface CashClarityPublicationAccount {
  readonly id: AccountId;
  readonly name: string;
  readonly accountType: AccountType;
  readonly accountSubtype?: AccountSubtype;
  readonly currencyCode: string;
  readonly icon?: IconName;
}

export interface CashClarityOpeningBalance {
  readonly journalId: JournalId;
  readonly accountId: AccountId;
  readonly accountType: AccountType;
  /** Signed opening amount; the direction decides the posting legs. */
  readonly signedAmount: number;
  readonly description: string;
}

export interface CashClarityPlannedPaymentPlan {
  readonly id: PlannedPaymentId;
  readonly input: PlannedPaymentCommandInput;
}

export interface CashClarityBudgetPlan {
  readonly id: BudgetId;
  readonly name: string;
  readonly amount: number;
  readonly assetAccountId: AccountId;
  readonly categoryAccountIds: readonly AccountId[];
}

/** Everything one Cash Clarity publication writes, with no repository types leaking to callers. */
export interface CashClarityPublicationPlan {
  readonly operationId: WorkplaceId;
  readonly workplace: {
    readonly name: string;
    /** Defaulted names must not collide with an existing Workplace name. */
    readonly nameIsDefault: boolean;
    readonly icon: IconName;
    readonly defaultCurrencyCode: string;
    readonly accounts: readonly CashClarityPublicationAccount[];
  };
  readonly openingBalances: readonly CashClarityOpeningBalance[];
  readonly plannedPayments: readonly CashClarityPlannedPaymentPlan[];
  readonly budgets: readonly CashClarityBudgetPlan[];
  readonly preserveWorkplaceName?: boolean;
}

export const CASH_CLARITY_PUBLICATION_RECEIPT_PREFIX = 'cash-clarity-publication:';

export function cashClarityPublicationReceiptId(operationId: WorkplaceId): string {
  return `${CASH_CLARITY_PUBLICATION_RECEIPT_PREFIX}${operationId}`;
}

export function cashClarityStableItemId(
  kind: 'journal' | 'planned-payment' | 'budget',
  operationId: WorkplaceId,
  itemId: string,
): string {
  return `cash-clarity:${operationId}:${kind}:${itemId}`;
}
