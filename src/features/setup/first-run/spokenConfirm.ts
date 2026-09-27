import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
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

function spokenDay(dateMs: number): string {
  const day = dayjs(dateMs).date();
  const teens = day % 100;
  const suffix =
    teens >= 11 && teens <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th';
  return `the ${day}${suffix}`;
}

function moneyPlaces(accounts: readonly DraftAccount[]): string {
  const kinds = new Set(
    accounts.filter(account => account.kind !== 'card').map(account => account.kind),
  );
  const places: string[] = [];
  if (kinds.has('bank')) places.push('banks');
  if (kinds.has('cash')) places.push('cash');
  if (kinds.has('savings')) places.push('savings');
  return andList(places);
}

export function confirmMoney(accounts: readonly DraftAccount[], currency: string): string {
  const held = accounts.filter(account => account.kind !== 'card');
  if (held.length === 0) return copy.clarityNoCashYet;
  const total = held.reduce((sum, account) => sum + account.balance, 0);
  const places = moneyPlaces(held);
  if (!places) return copy.clarityNoCashYet;
  return copy.confirmMoneyHave(formatDraftAmount(total, currency), places);
}

export function confirmIncome(items: readonly RecurringIncome[], currency: string): string {
  if (items.length === 0) return copy.confirmIncomeSkipped;
  return copy.confirmIncomeNoted(
    andList(
      items.map(item =>
        copy.confirmIncomeHit(
          formatDraftAmount(item.amount, currency),
          incomeItemName(item),
          spokenDay(item.nextDate),
        ),
      ),
    ),
  );
}

export function confirmPayments(items: readonly PaymentItem[], currency: string): string {
  if (items.length === 0) return copy.noPaymentIncluded;
  return copy.confirmPaymentMind(
    andList(
      items.map(item =>
        copy.confirmPaymentHit(
          formatDraftAmount(item.amount, currency),
          paymentItemName(item),
          spokenDay(item.dueDate),
        ),
      ),
    ),
  );
}

export function confirmBuffer(items: readonly BudgetItem[], currency: string): string {
  if (items.length === 0) return copy.noBufferIncluded;
  return copy.confirmBufferTrack(
    andList(
      items.map(item =>
        copy.confirmBufferMonth(item.name, formatDraftAmount(item.amount, currency)),
      ),
    ),
  );
}
