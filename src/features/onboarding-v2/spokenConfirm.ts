import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { ONBOARDING_V2_STRINGS as copy } from '@/src/constants/copy/domains/onboardingV2Strings';
import dayjs from 'dayjs';
import {
  incomeItemName,
  paymentItemName,
  type BudgetItem,
  type DraftAccount,
  type PaymentItem,
  type RecurringIncome,
} from './draft';

export function formatDraftAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const value = Number.isInteger(amount)
    ? amount.toLocaleString('en-US')
    : amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${value}`;
}

function andList(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function confirmMoney(accounts: readonly DraftAccount[], currency: string): string {
  if (accounts.length === 0) return copy.clarityNoCashYet;
  const parts = accounts.map(account => {
    const amount = formatDraftAmount(account.balance, currency);
    if (account.kind === 'card') {
      const outstanding = copy.confirmCardOutstanding(amount, account.name);
      if (account.cardPaymentAmount && account.cardPaymentDate) {
        return `${outstanding}, ${copy.confirmCardPaying(
          formatDraftAmount(account.cardPaymentAmount, currency),
          dayjs(account.cardPaymentDate).format('D MMM'),
        )}`;
      }
      return outstanding;
    }
    const held = copy.confirmInAccount(amount, account.name);
    return account.kind === 'savings' && account.spendable === false
      ? `${held} (${copy.savingsProtectedShort})`
      : held;
  });
  return copy.confirmMoneyGot(andList(parts));
}

export function confirmIncome(items: readonly RecurringIncome[], currency: string): string {
  if (items.length === 0) return copy.confirmIncomeSkipped;
  return copy.confirmIncomeKept(
    andList(
      items.map(item =>
        copy.confirmIncomeItem(
          formatDraftAmount(item.amount, currency),
          incomeItemName(item),
          dayjs(item.nextDate).format('D MMM'),
        ),
      ),
    ),
  );
}

export function confirmPayments(items: readonly PaymentItem[], currency: string): string {
  if (items.length === 0) return copy.noPaymentIncluded;
  return copy.confirmPaymentSpoken(
    andList(
      items.map(item =>
        copy.confirmPaymentItem(
          paymentItemName(item),
          formatDraftAmount(item.amount, currency),
          dayjs(item.dueDate).format('D MMM'),
        ),
      ),
    ),
  );
}

export function confirmBuffer(items: readonly BudgetItem[], currency: string): string {
  if (items.length === 0) return copy.noBufferIncluded;
  return copy.confirmBufferHeld(
    andList(
      items.map(item =>
        copy.confirmBufferItem(formatDraftAmount(item.amount, currency), item.name),
      ),
    ),
  );
}
