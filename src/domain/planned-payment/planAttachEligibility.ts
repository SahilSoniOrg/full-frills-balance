import {
  captureAllocationsMatchLines,
  type CaptureAllocation,
  type CaptureMetadata,
} from '@/src/domain/transaction-intelligence/captureMetadata';
import { AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';

export type PlanCategoryCounter =
  | {
      kind: 'category';
      accountId: AccountId;
      accountType: AccountType.EXPENSE | AccountType.INCOME;
      currencyCode: string;
    }
  | { kind: 'structural'; accountId: AccountId; accountType: AccountType; currencyCode: string };

export type PlanAttachUpgradeDecision =
  | {
      kind: 'rewrite';
      allocation: CaptureAllocation;
      counter: Extract<PlanCategoryCounter, { kind: 'category' }>;
      replaceDescription: boolean;
    }
  | {
      kind: 'link_only';
      reason:
        | 'no_capture'
        | 'not_uncategorized'
        | 'confirmed'
        | 'multiple_category_lines'
        | 'lines_edited'
        | 'currency_mismatch'
        | 'kind_mismatch'
        | 'structural_conflict';
    };

export interface PlanAttachAccountView {
  id: AccountId;
  accountType: AccountType;
  currencyCode: string;
}

export interface PlanAttachLineView {
  accountId: AccountId;
  amount: number;
  transactionType: CaptureAllocation['transactionType'];
  currencyCode?: string;
  accountType: AccountType;
}

/** Expense/income leg of a planned payment; balance-sheet destinations are structural. */
export function resolvePlanCategoryCounter(
  fromAccount: PlanAttachAccountView,
  toAccount: PlanAttachAccountView,
): PlanCategoryCounter {
  if (
    toAccount.accountType === AccountType.EXPENSE ||
    toAccount.accountType === AccountType.INCOME
  ) {
    return {
      kind: 'category',
      accountId: toAccount.id,
      accountType: toAccount.accountType,
      currencyCode: toAccount.currencyCode,
    };
  }
  if (
    fromAccount.accountType === AccountType.EXPENSE ||
    fromAccount.accountType === AccountType.INCOME
  ) {
    return {
      kind: 'category',
      accountId: fromAccount.id,
      accountType: fromAccount.accountType,
      currencyCode: fromAccount.currencyCode,
    };
  }
  return {
    kind: 'structural',
    accountId: toAccount.id,
    accountType: toAccount.accountType,
    currencyCode: toAccount.currencyCode,
  };
}

/** Capture-time description from buildCaptureJournal / decideCapture, before a user edit. */
export function isCaptureGeneratedDescription(
  description: string | undefined,
  capture: CaptureMetadata | null,
): boolean {
  const trimmed = description?.trim() ?? '';
  if (!capture) return trimmed.length === 0;
  const merchant = capture.merchant?.trim();
  if (merchant && trimmed === merchant) return true;
  if (trimmed === `Captured ${capture.economicKind}`) return true;
  return trimmed.length === 0;
}

/**
 * Whether plan attach may rewrite the Uncategorized category line.
 * Structural conflicts never rewrite; callers must confirm before linking.
 */
export function decidePlanAttachUpgrade(input: {
  capture: CaptureMetadata | null;
  lines: readonly PlanAttachLineView[];
  description: string | undefined;
  planCounter: PlanCategoryCounter;
}): PlanAttachUpgradeDecision {
  const { capture, lines, description, planCounter } = input;
  if (planCounter.kind === 'structural') {
    return { kind: 'link_only', reason: 'structural_conflict' };
  }
  if (!capture) return { kind: 'link_only', reason: 'no_capture' };

  const categoryLines = lines.filter(
    line => line.accountType === AccountType.EXPENSE || line.accountType === AccountType.INCOME,
  );
  if (categoryLines.length !== 1) {
    return { kind: 'link_only', reason: 'multiple_category_lines' };
  }
  if (!captureAllocationsMatchLines(capture.allocations, categoryLines)) {
    return { kind: 'link_only', reason: 'lines_edited' };
  }
  if (capture.allocations.length !== 1) {
    return { kind: 'link_only', reason: 'multiple_category_lines' };
  }

  const allocation = capture.allocations[0];
  if (allocation.origin !== 'uncategorized') {
    return { kind: 'link_only', reason: 'not_uncategorized' };
  }
  if (allocation.confirmedAt !== undefined) {
    return { kind: 'link_only', reason: 'confirmed' };
  }

  const line = categoryLines[0];
  if (line.accountType !== planCounter.accountType) {
    return { kind: 'link_only', reason: 'kind_mismatch' };
  }
  const lineCurrency = (line.currencyCode ?? allocation.currencyCode)?.trim().toUpperCase();
  const planCurrency = planCounter.currencyCode.trim().toUpperCase();
  if (lineCurrency && lineCurrency !== planCurrency) {
    return { kind: 'link_only', reason: 'currency_mismatch' };
  }

  return {
    kind: 'rewrite',
    allocation,
    counter: planCounter,
    replaceDescription: isCaptureGeneratedDescription(description, capture),
  };
}
