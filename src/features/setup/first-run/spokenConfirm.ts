import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { getCurrencyLocale } from '@/src/utils/currencyFormatter';
import {
  incomeItemName,
  isSpendableAccount,
  paymentItemName,
  type BudgetItem,
  type DraftAccount,
  type PaymentItem,
  type RecurringIncome,
} from './draft';

export function formatDraftAmount(amount: number, currency: string, localeOverride?: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const locale = localeOverride ?? getCurrencyLocale(currency) ?? 'en-US';
  const toText = (n: number) =>
    Number.isInteger(n)
      ? n.toLocaleString(locale)
      : n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = amount < 0 ? '-' : '';
  return `${sign}${symbol}${toText(Math.abs(amount))}`;
}

function andList(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function spokenDay(dateMs: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(dateMs));
}

function moneyPlaces(accounts: readonly DraftAccount[]): string {
  const kinds = new Set(
    accounts.filter(isSpendableAccount).map(account => account.kind),
  );
  const places: string[] = [];
  if (kinds.has('bank')) places.push('banks');
  if (kinds.has('cash')) places.push('cash');
  if (kinds.has('savings')) places.push('savings');
  return andList(places);
}

export function confirmMoney(accounts: readonly DraftAccount[], currency: string, locale?: string): string {
  const held = accounts.filter(isSpendableAccount);
  if (held.length === 0) return copy.clarityNoCashYet;
  const total = held.reduce((sum, account) => sum + account.balance, 0);
  const places = moneyPlaces(held);
  if (!places) return copy.clarityNoCashYet;
  return copy.confirmMoneyHave(formatDraftAmount(total, currency, locale), places);
}

export function confirmIncome(items: readonly RecurringIncome[], currency: string, locale = 'en-US'): string {
  if (items.length === 0) return copy.confirmIncomeSkipped;
  return copy.confirmIncomeNoted(
    andList(
      items.map(item =>
        copy.confirmIncomeHit(
          formatDraftAmount(item.amount, currency, locale),
          incomeItemName(item),
          spokenDay(item.nextDate, locale),
        ),
      ),
    ),
  );
}

export function confirmPayments(items: readonly PaymentItem[], currency: string, locale = 'en-US'): string {
  if (items.length === 0) return copy.noPaymentIncluded;
  return copy.confirmPaymentMind(
    andList(
      items.map(item =>
        copy.confirmPaymentHit(
          formatDraftAmount(item.amount, currency, locale),
          paymentItemName(item),
          spokenDay(item.dueDate, locale),
        ),
      ),
    ),
  );
}

export function confirmBuffer(items: readonly BudgetItem[], currency: string, locale?: string): string {
  if (items.length === 0) return copy.noBufferIncluded;
  return copy.confirmBufferTrack(
    andList(
      items.map(item =>
      copy.confirmBufferMonth(item.name, formatDraftAmount(item.amount, currency, locale)),
      ),
    ),
  );
}
