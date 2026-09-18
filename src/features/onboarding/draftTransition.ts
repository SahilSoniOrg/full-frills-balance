import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { formatDraftAmount } from './spokenConfirm';
import {
  incomeItemName,
  paymentItemName,
  type BudgetItem,
  type CashClarityDraft,
  type DraftAccount,
  type PaymentItem,
  type RecurringIncome,
} from './draft';

function firstAdded<T extends { readonly id: string }>(
  previous: readonly T[],
  current: readonly T[],
): T | undefined {
  const previousIds = new Set(previous.map(item => item.id));
  return current.find(item => !previousIds.has(item.id));
}

function firstRemoved<T extends { readonly id: string }>(
  previous: readonly T[],
  current: readonly T[],
): T | undefined {
  const currentIds = new Set(current.map(item => item.id));
  return previous.find(item => !currentIds.has(item.id));
}

function changedAmount<T extends { readonly id: string; readonly amount: number }>(
  previous: readonly T[],
  current: readonly T[],
): { previous: T; current: T } | undefined {
  for (const item of current) {
    const before = previous.find(previousItem => previousItem.id === item.id);
    if (before && before.amount !== item.amount) return { previous: before, current: item };
  }
  return undefined;
}

function accountChange(
  previous: readonly DraftAccount[],
  current: readonly DraftAccount[],
  currency: string,
): string | null {
  const added = firstAdded(previous, current);
  if (added) return copy.changeAdded(added.name);

  const removed = firstRemoved(previous, current);
  if (removed) return copy.changeRemoved(removed.name);

  const before = current
    .map(account => ({
      current: account,
      previous: previous.find(item => item.id === account.id),
    }))
    .find(item => item.previous && item.previous.balance !== item.current.balance);
  if (before?.previous) {
    const delta = before.current.balance - before.previous.balance;
    const amount = formatDraftAmount(Math.abs(delta), currency);
    return delta > 0
      ? copy.changeBalanceAdded(amount, before.current.name)
      : copy.changeBalanceRemoved(amount, before.current.name);
  }

  const cardPayment = current
    .map(account => ({
      current: account,
      previous: previous.find(item => item.id === account.id),
    }))
    .find(
      item => item.previous && item.previous.cardPaymentAmount !== item.current.cardPaymentAmount,
    );
  if (cardPayment?.previous) {
    const amount = cardPayment.current.cardPaymentAmount ?? 0;
    if (amount > 0) {
      return copy.changeCardPayment(formatDraftAmount(amount, currency), cardPayment.current.name);
    }
    return copy.changeCardPaymentRemoved(cardPayment.current.name);
  }

  return null;
}

function incomeChange(
  previous: CashClarityDraft['income'],
  current: CashClarityDraft['income'],
  currency: string,
): string | null {
  if (current.kind === 'skipped' && previous.kind !== 'skipped') return copy.changeIncomeSkipped;
  const previousItems = previous.kind === 'recurring' ? previous.items : [];
  const currentItems = current.kind === 'recurring' ? current.items : [];
  const added = firstAdded(previousItems, currentItems);
  if (added) return incomeSummary(added, currency);
  const changed = changedAmount(previousItems, currentItems);
  return changed ? incomeSummary(changed.current, currency) : null;
}

function incomeSummary(item: RecurringIncome, currency: string): string {
  return copy.changeIncome(formatDraftAmount(item.amount, currency), incomeItemName(item));
}

function paymentChange(
  previous: CashClarityDraft['commitment'],
  current: CashClarityDraft['commitment'],
  currency: string,
): string | null {
  if (current.kind === 'skipped' && previous.kind !== 'skipped') return copy.changePaymentsSkipped;
  const previousItems = previous.kind === 'payment' ? previous.items : [];
  const currentItems = current.kind === 'payment' ? current.items : [];
  const added = firstAdded(previousItems, currentItems);
  if (added) return paymentSummary(added, currency);
  const removed = firstRemoved(previousItems, currentItems);
  if (removed) return copy.changeRemoved(paymentItemName(removed));
  const changed = changedAmount(previousItems, currentItems);
  return changed ? paymentSummary(changed.current, currency) : null;
}

function paymentSummary(item: PaymentItem, currency: string): string {
  return copy.changePayment(formatDraftAmount(item.amount, currency), paymentItemName(item));
}

function budgetChange(
  previous: CashClarityDraft['budget'],
  current: CashClarityDraft['budget'],
  currency: string,
): string | null {
  if (current.kind === 'skipped' && previous.kind !== 'skipped') return copy.changeBudgetsSkipped;
  const previousItems = previous.kind === 'set' ? previous.items : [];
  const currentItems = current.kind === 'set' ? current.items : [];
  const added = firstAdded(previousItems, currentItems);
  if (added) return budgetSummary(added, currency);
  const removed = firstRemoved(previousItems, currentItems);
  if (removed) return copy.changeRemoved(removed.name);
  const changed = changedAmount(previousItems, currentItems);
  return changed ? budgetSummary(changed.current, currency) : null;
}

function budgetSummary(item: BudgetItem, currency: string): string {
  return copy.changeBudget(formatDraftAmount(item.amount, currency), item.name);
}

/**
 * Describes the latest meaningful draft transition without recalculating the
 * projection. Presentation can safely show this next to the live result.
 */
export function explainDraftTransition(
  previous: CashClarityDraft,
  current: CashClarityDraft,
): string | null {
  const currency = current.currency;
  return (
    accountChange(previous.accounts, current.accounts, currency) ??
    incomeChange(previous.income, current.income, currency) ??
    paymentChange(previous.commitment, current.commitment, currency) ??
    budgetChange(previous.budget, current.budget, currency)
  );
}
