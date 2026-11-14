import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { roundToPrecision } from '@/src/utils/money';
import dayjs, { type Dayjs } from 'dayjs';
import {
  incomeItemName,
  paymentItemName,
  type BudgetItem,
  type CashClarityDraft,
  type DraftAccount,
  type PaymentItem,
  type RecurringIncome,
} from './draft';
import { projectCashClarityDraft } from './projectCashClarityDraft';
import { formatDraftAmount } from './spokenConfirm';

type Identified = { readonly id: string };

function amountWasEdited<T extends Identified>(
  previous: readonly T[],
  current: readonly T[],
  amount: (item: T) => unknown,
): boolean {
  return current.some(item => {
    const before = previous.find(candidate => candidate.id === item.id);
    return before != null && amount(before) !== amount(item);
  });
}

function hasAmountEdit(previous: CashClarityDraft, current: CashClarityDraft): boolean {
  return (
    amountWasEdited(previous.accounts, current.accounts, item => item.balance) ||
    amountWasEdited(previous.accounts, current.accounts, item => item.cardPaymentAmount) ||
    amountWasEdited(
      previous.income.kind === 'recurring' ? previous.income.items : [],
      current.income.kind === 'recurring' ? current.income.items : [],
      item => item.amount,
    ) ||
    amountWasEdited(
      previous.commitment.kind === 'payment' ? previous.commitment.items : [],
      current.commitment.kind === 'payment' ? current.commitment.items : [],
      item => item.amount,
    ) ||
    amountWasEdited(
      previous.budget.kind === 'set' ? previous.budget.items : [],
      current.budget.kind === 'set' ? current.budget.items : [],
      item => item.amount,
    )
  );
}

type ListChangeLabels<T extends Identified> = {
  added: (item: T) => string;
  removed: (item: T) => string;
  updated: (previous: T, current: T) => string | null;
};

function firstListChange<T extends Identified>(
  previous: readonly T[],
  current: readonly T[],
  labels: ListChangeLabels<T>,
): string | null {
  const previousById = new Map(previous.map(item => [item.id, item]));
  const currentById = new Map(current.map(item => [item.id, item]));
  const added = current.find(item => !previousById.has(item.id));
  if (added) return labels.added(added);
  const removed = previous.find(item => !currentById.has(item.id));
  if (removed) return labels.removed(removed);

  for (const item of current) {
    const before = previousById.get(item.id);
    if (!before) continue;
    const description = labels.updated(before, item);
    if (description) return description;
  }
  return null;
}

function accountUpdate(previous: DraftAccount, current: DraftAccount, currency: string): string | null {
  if (previous.balance !== current.balance) {
    return copy.transitionBalanceSet(current.name, formatDraftAmount(current.balance, currency));
  }
  if (
    previous.cardPaymentAmount !== current.cardPaymentAmount ||
    previous.cardPaymentDate !== current.cardPaymentDate
  ) {
    return copy.transitionCardPaymentUpdated(current.name);
  }
  if (previous.spendable !== current.spendable) return copy.transitionAvailabilityUpdated(current.name);
  if (previous.name !== current.name || previous.kind !== current.kind) {
    return copy.transitionAccountUpdated(current.name);
  }
  return null;
}

function incomeUpdate(previous: RecurringIncome, current: RecurringIncome): string | null {
  const changed =
    previous.name !== current.name ||
    previous.source !== current.source ||
    previous.amount !== current.amount ||
    previous.interval !== current.interval ||
    previous.intervalN !== current.intervalN ||
    previous.nextDate !== current.nextDate;
  return changed ? copy.transitionIncomeChanged(incomeItemName(current)) : null;
}

function paymentUpdate(previous: PaymentItem, current: PaymentItem): string | null {
  const changed =
    previous.name !== current.name ||
    previous.type !== current.type ||
    previous.amount !== current.amount ||
    previous.dueDate !== current.dueDate;
  return changed ? copy.transitionPaymentChanged(paymentItemName(current)) : null;
}

function budgetUpdate(previous: BudgetItem, current: BudgetItem): string | null {
  const changed =
    previous.name !== current.name ||
    previous.category !== current.category ||
    previous.amount !== current.amount;
  return changed ? copy.transitionBudgetChanged(current.name) : null;
}

function describeDraftChange(previous: CashClarityDraft, current: CashClarityDraft): string | null {
  if (previous.currency !== current.currency) return copy.transitionCurrencyChanged;

  const accountChange = firstListChange(previous.accounts, current.accounts, {
    added: item => copy.transitionAccountAdded(item.name),
    removed: item => copy.transitionAccountRemoved(item.name),
    updated: (before, item) => accountUpdate(before, item, current.currency),
  });
  if (accountChange) return accountChange;

  if (current.income.kind === 'skipped' && previous.income.kind !== 'skipped') {
    return copy.transitionIncomeSkipped;
  }
  const incomeChange = firstListChange(
    previous.income.kind === 'recurring' ? previous.income.items : [],
    current.income.kind === 'recurring' ? current.income.items : [],
    {
      added: item => copy.transitionIncomeAdded(incomeItemName(item)),
      removed: item => copy.transitionIncomeRemoved(incomeItemName(item)),
      updated: incomeUpdate,
    },
  );
  if (incomeChange) return incomeChange;

  if (current.commitment.kind === 'skipped' && previous.commitment.kind !== 'skipped') {
    return copy.transitionPaymentsSkipped;
  }
  const paymentChange = firstListChange(
    previous.commitment.kind === 'payment' ? previous.commitment.items : [],
    current.commitment.kind === 'payment' ? current.commitment.items : [],
    {
      added: item => copy.transitionPaymentAdded(paymentItemName(item)),
      removed: item => copy.transitionPaymentRemoved(paymentItemName(item)),
      updated: paymentUpdate,
    },
  );
  if (paymentChange) return paymentChange;

  if (current.budget.kind === 'skipped' && previous.budget.kind !== 'skipped') {
    return copy.transitionBudgetsSkipped;
  }
  return firstListChange(
    previous.budget.kind === 'set' ? previous.budget.items : [],
    current.budget.kind === 'set' ? current.budget.items : [],
    {
      added: item => copy.transitionBudgetAdded(item.name),
      removed: item => copy.transitionBudgetRemoved(item.name),
      updated: budgetUpdate,
    },
  );
}

/** Describes a draft mutation using the same projection that supplies the displayed number. */
export function explainDraftTransition(
  previous: CashClarityDraft,
  current: CashClarityDraft,
  now: Dayjs = dayjs(),
): string | null {
  const reason = describeDraftChange(previous, current);
  if (!reason) return null;

  const previousSafeToSpend = projectCashClarityDraft(previous, now).safeToSpend;
  const currentSafeToSpend = projectCashClarityDraft(current, now).safeToSpend;
  const delta = roundToPrecision(
    currentSafeToSpend - previousSafeToSpend,
    CurrencyFormatter.getPrecisionFallback(current.currency),
  );
  // Each keystroke is a draft mutation, so its delta is not the amount the user entered.
  if (delta !== 0 && hasAmountEdit(previous, current)) {
    return copy.changeSafeToSpendUpdated(reason);
  }
  if (delta > 0) {
    return copy.changeSafeToSpendAdded(formatDraftAmount(delta, current.currency), reason);
  }
  if (delta < 0) {
    return copy.changeSafeToSpendHeld(formatDraftAmount(Math.abs(delta), current.currency), reason);
  }
  return copy.changeSafeToSpendUnchanged(reason);
}
