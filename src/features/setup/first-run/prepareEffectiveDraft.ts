import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { getLocales } from 'expo-localization';
import { amountIssueMessage, currencyPrecision, formatAmountInput, parseAmountInput } from './amountValidation';
import {
  amountInputKey,
  cardPaymentInputKey,
  hasSpendableAccount,
  isSpendableAccount,
  type BudgetItem,
  type CashClarityCollection,
  type CashClarityDraft,
  type CashClarityEditableInput,
  type PaymentItem,
  type RecurringIncome,
} from './draft';

export type DraftAmountField = 'balance' | 'amount' | 'cardPaymentAmount' | 'dependency';
export type DraftAmountIssueReason = 'empty' | 'malformed' | 'precision' | 'non-finite' | 'range' | 'dependency';

export interface DraftAmountIssue {
  readonly collection: CashClarityCollection;
  readonly itemId?: string;
  readonly field: DraftAmountField;
  readonly reason: DraftAmountIssueReason;
  readonly message: string;
}

export interface PreparedCashClarityInput {
  /** Numeric, valid, included input. Pass this same value to preview, review, and publication. */
  readonly effectiveDraft: CashClarityDraft;
  readonly deferredCollections: readonly CashClarityCollection[];
  readonly issues: readonly DraftAmountIssue[];
  readonly isValid: boolean;
  /** True when at least one included account has a known balance and is eligible to spend. */
  readonly hasUsableEstimate: boolean;
  /** True only when the estimate is usable, all included fields validate, and nothing is deferred. */
  readonly isCompleteEstimate: boolean;
  readonly estimateStatus: 'unavailable' | 'incomplete' | 'ready';
  /** Included input errors or intentionally omitted/deferred input make the estimate incomplete. */
  readonly isIncomplete: boolean;
}

function deferred(
  input: CashClarityEditableInput,
  collection: CashClarityCollection,
): boolean {
  return input.deferredCollections?.[collection] === true;
}

function rawText(input: CashClarityEditableInput, key: string, fallback: number, locale: string): string {
  const value = input.amountTextById[key];
  return typeof value === 'string' ? value : formatAmountInput(fallback, locale);
}

/**
 * API: prepareCashClarityInput(draft, editableInput, locale?) returns `effectiveDraft`, issues,
 * deferred collections, `isValid`, `hasUsableEstimate`, `isCompleteEstimate`, `estimateStatus`,
 * and `isIncomplete`. `locale` parses the user's input separators; currency precision comes
 * independently from `draft.currency`. A blank raw balance is invalid, while an explicit `0` is
 * valid. Missing raw keys fall back to existing numeric values for legacy callers. A deferred
 * collection is never parsed into, or copied into, `effectiveDraft`.
 */
export function prepareCashClarityInput(
  draft: CashClarityDraft,
  editableInput: CashClarityEditableInput,
  locale: string = getLocales()[0]?.languageTag ?? 'en-US',
): PreparedCashClarityInput {
  const precision = currencyPrecision(draft.currency);
  const issues: DraftAmountIssue[] = [];
  const deferredCollections = (['accounts', 'income', 'commitment', 'budget'] as const).filter(key =>
    deferred(editableInput, key),
  );

  const accountDrafts = deferred(editableInput, 'accounts')
    ? []
    : draft.accounts.flatMap(account => {
        const parsed = parseAmountInput(
          rawText(editableInput, amountInputKey(account.id), account.balance, locale),
          locale,
          precision,
        );
        const message = amountIssueMessage(parsed, false, account.kind !== 'card');
        if (message) {
          issues.push({
            collection: 'accounts',
            itemId: account.id,
            field: 'balance',
            reason:
              parsed.status === 'empty'
                ? 'empty'
                : parsed.status === 'invalid'
                  ? parsed.reason === 'precision'
                    ? 'precision'
                    : parsed.reason
                  : 'range',
            message,
          });
          return [];
        }
        if (parsed.status !== 'valid') return [];
        if (account.kind === 'savings' && account.spendable === undefined) {
          issues.push({
            collection: 'accounts',
            itemId: account.id,
            field: 'dependency',
            reason: 'dependency',
            message: copy.savingsAvailabilityRequired,
          });
          return [];
        }
        return [{ ...account, balance: parsed.value }];
      });

  let effectiveAccounts = accountDrafts;
  if (!deferred(editableInput, 'accounts')) {
    effectiveAccounts = accountDrafts.map(account => {
      if (account.kind !== 'card') return account;
      const rawCardValue = editableInput.amountTextById[cardPaymentInputKey(account.id)];
      const rawCardPayment = typeof rawCardValue === 'string'
        ? rawCardValue
        : account.cardPaymentAmount ? formatAmountInput(account.cardPaymentAmount, locale) : '';
      if (rawCardPayment.trim() === '') {
        return { ...account, cardPaymentAmount: undefined, cardPaymentDate: undefined };
      }
      const parsed = parseAmountInput(rawCardPayment, locale, precision);
      const message = amountIssueMessage(parsed, false, false);
      if (message) {
        issues.push({
          collection: 'accounts',
          itemId: account.id,
          field: 'cardPaymentAmount',
          reason:
            parsed.status === 'empty'
              ? 'empty'
              : parsed.status === 'invalid'
                ? parsed.reason === 'precision'
                  ? 'precision'
                  : parsed.reason
                : 'range',
          message,
        });
        return { ...account, cardPaymentAmount: undefined, cardPaymentDate: undefined };
      }
      return parsed.status === 'valid' && parsed.value > 0
        ? { ...account, cardPaymentAmount: parsed.value }
        : { ...account, cardPaymentAmount: undefined, cardPaymentDate: undefined };
    });
  }

  const hasSpendable = hasSpendableAccount(effectiveAccounts);
  const effectiveIncome = deferred(editableInput, 'income')
    ? { kind: 'skipped' as const }
    : draft.income.kind === 'recurring'
      ? {
          kind: 'recurring' as const,
          items: preparePositiveItems(draft.income.items, editableInput, 'income', locale, precision, issues),
        }
      : draft.income;
  const effectiveCommitment = deferred(editableInput, 'commitment')
    ? { kind: 'skipped' as const }
    : draft.commitment.kind === 'payment'
      ? {
          kind: 'payment' as const,
          items: preparePositiveItems(
            draft.commitment.items,
            editableInput,
            'commitment',
            locale,
            precision,
            issues,
          ),
        }
      : draft.commitment;
  const effectiveBudget = deferred(editableInput, 'budget')
    ? { kind: 'skipped' as const }
    : draft.budget.kind === 'set'
      ? {
          kind: 'set' as const,
          items: preparePositiveItems(draft.budget.items, editableInput, 'budget', locale, precision, issues),
        }
      : draft.budget;

  const hasDependentItems =
    (effectiveIncome.kind === 'recurring' && effectiveIncome.items.length > 0) ||
    (effectiveCommitment.kind === 'payment' && effectiveCommitment.items.length > 0) ||
    (effectiveBudget.kind === 'set' && effectiveBudget.items.length > 0) ||
    effectiveAccounts.some(account => (account.cardPaymentAmount ?? 0) > 0);

  if (!hasSpendable && hasDependentItems) {
    for (const collection of ['income', 'commitment', 'budget'] as const) {
      const collectionHasItems =
        (collection === 'income' && effectiveIncome.kind === 'recurring' && effectiveIncome.items.length > 0) ||
        (collection === 'commitment' && effectiveCommitment.kind === 'payment' && effectiveCommitment.items.length > 0) ||
        (collection === 'budget' && effectiveBudget.kind === 'set' && effectiveBudget.items.length > 0);
      if (collectionHasItems && !deferred(editableInput, collection)) {
        issues.push({
          collection,
          field: 'dependency',
          reason: 'dependency',
          message: copy.dependentAccountRequired,
        });
      }
    }
    for (const account of effectiveAccounts) {
      if (account.kind === 'card' && (account.cardPaymentAmount ?? 0) > 0) {
        issues.push({
          collection: 'accounts',
          itemId: account.id,
          field: 'dependency',
          reason: 'dependency',
          message: copy.cardAccountRequired,
        });
      }
    }
  }

  // No dependent plan may silently disappear into a projection when its spendable source is absent.
  const includeDependents = hasSpendable;
  if (!includeDependents) {
    effectiveAccounts = effectiveAccounts.map(account =>
      account.kind === 'card'
        ? { ...account, cardPaymentAmount: undefined, cardPaymentDate: undefined }
        : account,
    );
  }

  const effectiveDraft: CashClarityDraft = {
    ...draft,
    accounts: effectiveAccounts,
    income: deferred(editableInput, 'income')
      ? { kind: 'skipped' }
      : includeDependents
        ? effectiveIncome
        : { kind: 'skipped' },
    commitment: deferred(editableInput, 'commitment')
      ? { kind: 'skipped' }
      : includeDependents
        ? effectiveCommitment
        : { kind: 'skipped' },
    budget: deferred(editableInput, 'budget')
      ? { kind: 'skipped' }
      : includeDependents
        ? effectiveBudget
        : { kind: 'skipped' },
  };
  const finalDraft = deferred(editableInput, 'accounts')
    ? { ...effectiveDraft, accounts: [] }
    : effectiveDraft;
  const isValid = issues.length === 0;
  const isIncomplete = issues.length > 0 || deferredCollections.length > 0;
  const hasUsableEstimate = finalDraft.accounts.some(isSpendableAccount);
  const isCompleteEstimate = hasUsableEstimate && isValid && deferredCollections.length === 0;

  return {
    effectiveDraft: finalDraft,
    deferredCollections,
    issues,
    isValid,
    hasUsableEstimate,
    isCompleteEstimate,
    estimateStatus: !hasUsableEstimate ? 'unavailable' : isCompleteEstimate ? 'ready' : 'incomplete',
    isIncomplete,
  };
}

function preparePositiveItems<T extends RecurringIncome | PaymentItem | BudgetItem>(
  items: readonly T[],
  editableInput: CashClarityEditableInput,
  collection: 'income' | 'commitment' | 'budget',
  locale: string,
  precision: number,
  issues: DraftAmountIssue[],
): T[] {
  return items.flatMap(item => {
    const parsed = parseAmountInput(
      rawText(editableInput, amountInputKey(item.id), item.amount, locale),
      locale,
      precision,
    );
    const message = amountIssueMessage(parsed, true, false);
    if (message) {
      issues.push({
        collection,
        itemId: item.id,
        field: 'amount',
        reason:
          parsed.status === 'empty'
            ? 'empty'
            : parsed.status === 'invalid'
              ? parsed.reason === 'precision'
                ? 'precision'
                : parsed.reason
              : 'range',
        message,
      });
      return [];
    }
    return parsed.status === 'valid' ? [{ ...item, amount: parsed.value }] : [];
  });
}

