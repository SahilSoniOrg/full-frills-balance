import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { projectCashClarityDraft } from './projectCashClarityDraft';
import { formatDraftAmount } from './spokenConfirm';
import { incomeItemName, paymentItemName, type CashClarityDraft, type DraftAccount } from './draft';
import dayjs, { type Dayjs } from 'dayjs';

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

function roundedAmount(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function safeToSpendEffect(
  previous: CashClarityDraft,
  current: CashClarityDraft,
  currency: string,
  reason: string,
  now: Dayjs,
): string {
  const previousSafeToSpend = projectCashClarityDraft(previous, now).safeToSpend;
  const currentSafeToSpend = projectCashClarityDraft(current, now).safeToSpend;
  const delta = roundedAmount(currentSafeToSpend - previousSafeToSpend);
  if (delta > 0) {
    return copy.changeSafeToSpendAdded(formatDraftAmount(delta, currency), reason);
  }
  if (delta < 0) {
    return copy.changeSafeToSpendHeld(formatDraftAmount(Math.abs(delta), currency), reason);
  }
  return copy.changeSafeToSpendUnchanged(reason);
}

function accountChange(
  previousDraft: CashClarityDraft,
  currentDraft: CashClarityDraft,
  previous: readonly DraftAccount[],
  current: readonly DraftAccount[],
  currency: string,
  now: Dayjs,
): string | null {
  const added = firstAdded(previous, current);
  if (added) {
    return safeToSpendEffect(previousDraft, currentDraft, currency, `${added.name} added`, now);
  }

  const removed = firstRemoved(previous, current);
  if (removed) {
    return safeToSpendEffect(previousDraft, currentDraft, currency, `${removed.name} removed`, now);
  }

  const before = current
    .map(account => ({
      current: account,
      previous: previous.find(item => item.id === account.id),
    }))
    .find(item => item.previous && item.previous.balance !== item.current.balance);
  if (before?.previous) {
    const delta = before.current.balance - before.previous.balance;
    return safeToSpendEffect(
      previousDraft,
      currentDraft,
      currency,
      `${before.current.name} balance ${delta > 0 ? 'increased' : 'decreased'}`,
      now,
    );
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
    const reason =
      amount > 0
        ? `${cardPayment.current.name} card payment updated`
        : `${cardPayment.current.name} card payment removed`;
    return safeToSpendEffect(previousDraft, currentDraft, currency, reason, now);
  }

  return null;
}

function incomeChange(
  previousDraft: CashClarityDraft,
  currentDraft: CashClarityDraft,
  previous: CashClarityDraft['income'],
  current: CashClarityDraft['income'],
  currency: string,
  now: Dayjs,
): string | null {
  if (current.kind === 'skipped' && previous.kind !== 'skipped') {
    return safeToSpendEffect(previousDraft, currentDraft, currency, 'income skipped', now);
  }
  const previousItems = previous.kind === 'recurring' ? previous.items : [];
  const currentItems = current.kind === 'recurring' ? current.items : [];
  const added = firstAdded(previousItems, currentItems);
  if (added) {
    return safeToSpendEffect(
      previousDraft,
      currentDraft,
      currency,
      `${incomeItemName(added)} income added`,
      now,
    );
  }
  const removed = firstRemoved(previousItems, currentItems);
  if (removed) {
    return safeToSpendEffect(
      previousDraft,
      currentDraft,
      currency,
      `${incomeItemName(removed)} income removed`,
      now,
    );
  }
  const changed = changedAmount(previousItems, currentItems);
  return changed
    ? safeToSpendEffect(
        previousDraft,
        currentDraft,
        currency,
        `${incomeItemName(changed.current)} income changed`,
        now,
      )
    : null;
}

function paymentChange(
  previousDraft: CashClarityDraft,
  currentDraft: CashClarityDraft,
  previous: CashClarityDraft['commitment'],
  current: CashClarityDraft['commitment'],
  currency: string,
  now: Dayjs,
): string | null {
  if (current.kind === 'skipped' && previous.kind !== 'skipped') {
    return safeToSpendEffect(
      previousDraft,
      currentDraft,
      currency,
      'planned payments skipped',
      now,
    );
  }
  const previousItems = previous.kind === 'payment' ? previous.items : [];
  const currentItems = current.kind === 'payment' ? current.items : [];
  const added = firstAdded(previousItems, currentItems);
  if (added) {
    return safeToSpendEffect(
      previousDraft,
      currentDraft,
      currency,
      `${paymentItemName(added)} payment added`,
      now,
    );
  }
  const removed = firstRemoved(previousItems, currentItems);
  if (removed) {
    return safeToSpendEffect(
      previousDraft,
      currentDraft,
      currency,
      `${paymentItemName(removed)} payment removed`,
      now,
    );
  }
  const changed = changedAmount(previousItems, currentItems);
  return changed
    ? safeToSpendEffect(
        previousDraft,
        currentDraft,
        currency,
        `${paymentItemName(changed.current)} payment changed`,
        now,
      )
    : null;
}

function budgetChange(
  previousDraft: CashClarityDraft,
  currentDraft: CashClarityDraft,
  previous: CashClarityDraft['budget'],
  current: CashClarityDraft['budget'],
  currency: string,
  now: Dayjs,
): string | null {
  if (current.kind === 'skipped' && previous.kind !== 'skipped') {
    return safeToSpendEffect(previousDraft, currentDraft, currency, 'budgets skipped', now);
  }
  const previousItems = previous.kind === 'set' ? previous.items : [];
  const currentItems = current.kind === 'set' ? current.items : [];
  const added = firstAdded(previousItems, currentItems);
  if (added) {
    return safeToSpendEffect(
      previousDraft,
      currentDraft,
      currency,
      `${added.name} budget added`,
      now,
    );
  }
  const removed = firstRemoved(previousItems, currentItems);
  if (removed) {
    return safeToSpendEffect(
      previousDraft,
      currentDraft,
      currency,
      `${removed.name} budget removed`,
      now,
    );
  }
  const changed = changedAmount(previousItems, currentItems);
  return changed
    ? safeToSpendEffect(
        previousDraft,
        currentDraft,
        currency,
        `${changed.current.name} budget changed`,
        now,
      )
    : null;
}

/**
 * Describes the latest meaningful draft transition using the same projection
 * that supplies the live Safe-to-Spend number.
 */
export function explainDraftTransition(
  previous: CashClarityDraft,
  current: CashClarityDraft,
  now: Dayjs = dayjs(),
): string | null {
  const currency = current.currency;
  return (
    accountChange(previous, current, previous.accounts, current.accounts, currency, now) ??
    incomeChange(previous, current, previous.income, current.income, currency, now) ??
    paymentChange(previous, current, previous.commitment, current.commitment, currency, now) ??
    budgetChange(previous, current, previous.budget, current.budget, currency, now)
  );
}
