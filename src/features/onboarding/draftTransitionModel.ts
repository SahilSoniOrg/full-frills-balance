import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
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

function accountUpdate(previous: DraftAccount, current: DraftAccount): string | null {
  if (previous.balance !== current.balance) {
    return `${current.name} balance ${current.balance > previous.balance ? 'increased' : 'decreased'}`;
  }
  if (
    previous.cardPaymentAmount !== current.cardPaymentAmount ||
    previous.cardPaymentDate !== current.cardPaymentDate
  ) {
    return `${current.name} card payment updated`;
  }
  if (previous.spendable !== current.spendable) return `${current.name} availability updated`;
  if (previous.name !== current.name || previous.kind !== current.kind) {
    return `${current.name} account updated`;
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
  return changed ? `${incomeItemName(current)} income changed` : null;
}

function paymentUpdate(previous: PaymentItem, current: PaymentItem): string | null {
  const changed =
    previous.name !== current.name ||
    previous.type !== current.type ||
    previous.amount !== current.amount ||
    previous.dueDate !== current.dueDate;
  return changed ? `${paymentItemName(current)} payment changed` : null;
}

function budgetUpdate(previous: BudgetItem, current: BudgetItem): string | null {
  const changed =
    previous.name !== current.name ||
    previous.category !== current.category ||
    previous.amount !== current.amount;
  return changed ? `${current.name} budget changed` : null;
}

function describeDraftChange(previous: CashClarityDraft, current: CashClarityDraft): string | null {
  if (previous.currency !== current.currency) return 'currency changed';

  const accountChange = firstListChange(previous.accounts, current.accounts, {
    added: item => `${item.name} added`,
    removed: item => `${item.name} removed`,
    updated: accountUpdate,
  });
  if (accountChange) return accountChange;

  if (current.income.kind === 'skipped' && previous.income.kind !== 'skipped') {
    return 'income skipped';
  }
  const incomeChange = firstListChange(
    previous.income.kind === 'recurring' ? previous.income.items : [],
    current.income.kind === 'recurring' ? current.income.items : [],
    {
      added: item => `${incomeItemName(item)} income added`,
      removed: item => `${incomeItemName(item)} income removed`,
      updated: incomeUpdate,
    },
  );
  if (incomeChange) return incomeChange;

  if (current.commitment.kind === 'skipped' && previous.commitment.kind !== 'skipped') {
    return 'planned payments skipped';
  }
  const paymentChange = firstListChange(
    previous.commitment.kind === 'payment' ? previous.commitment.items : [],
    current.commitment.kind === 'payment' ? current.commitment.items : [],
    {
      added: item => `${paymentItemName(item)} payment added`,
      removed: item => `${paymentItemName(item)} payment removed`,
      updated: paymentUpdate,
    },
  );
  if (paymentChange) return paymentChange;

  if (current.budget.kind === 'skipped' && previous.budget.kind !== 'skipped') {
    return 'budgets skipped';
  }
  return firstListChange(
    previous.budget.kind === 'set' ? previous.budget.items : [],
    current.budget.kind === 'set' ? current.budget.items : [],
    {
      added: item => `${item.name} budget added`,
      removed: item => `${item.name} budget removed`,
      updated: budgetUpdate,
    },
  );
}

function roundedAmount(amount: number): number {
  return roundToPrecision(amount, 2);
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
  const delta = roundedAmount(currentSafeToSpend - previousSafeToSpend);
  if (delta > 0) {
    return copy.changeSafeToSpendAdded(formatDraftAmount(delta, current.currency), reason);
  }
  if (delta < 0) {
    return copy.changeSafeToSpendHeld(formatDraftAmount(Math.abs(delta), current.currency), reason);
  }
  return copy.changeSafeToSpendUnchanged(reason);
}
