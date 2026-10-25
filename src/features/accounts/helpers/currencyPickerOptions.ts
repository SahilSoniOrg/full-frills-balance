import { AppConfig } from '@/src/constants';
import type { PlainCurrency } from '@/src/types/plainDtos';

/** Short popular set — enough to scan, not a second full list. */
export const POPULAR_CURRENCY_CODES = [
  'USD',
  'EUR',
  'GBP',
  'INR',
  'JPY',
  'CNY',
  'CAD',
  'AUD',
  'CHF',
  'AED',
] as const;

export type CurrencyPickerRow = {
  id: string;
  name: string;
  code: string;
  symbol: string;
};

export type CurrencyPickerSection = {
  title: string;
  data: CurrencyPickerRow[];
};

function toRow(currency: PlainCurrency): CurrencyPickerRow {
  return {
    id: currency.code,
    name: currency.name,
    code: currency.code,
    symbol: currency.symbol,
  };
}

function sortByName(left: PlainCurrency, right: PlainCurrency) {
  return left.name.localeCompare(right.name) || left.code.localeCompare(right.code);
}

function matchesQuery(row: CurrencyPickerRow, query: string) {
  return (
    row.name.toLowerCase().includes(query) ||
    row.code.toLowerCase().includes(query) ||
    row.symbol.toLowerCase().includes(query)
  );
}

/** Popular (selected pinned) + remaining currencies by name. */
export function toCurrencyPickerSections(
  currencies: readonly PlainCurrency[],
  selectedCode: string | undefined,
): CurrencyPickerSection[] {
  const byCode = new Map(currencies.map(currency => [currency.code, currency]));
  const popularCodes = [
    ...(selectedCode && byCode.has(selectedCode) ? [selectedCode] : []),
    ...POPULAR_CURRENCY_CODES.filter(code => code !== selectedCode && byCode.has(code)),
  ];
  const popularSet = new Set(popularCodes);
  const popular = popularCodes
    .map(code => byCode.get(code))
    .filter((currency): currency is PlainCurrency => currency != null)
    .map(toRow);
  const rest = currencies
    .filter(currency => !popularSet.has(currency.code))
    .sort(sortByName)
    .map(toRow);

  const copy = AppConfig.strings.accounts;
  return [
    ...(popular.length ? [{ title: copy.popularCurrencies, data: popular }] : []),
    ...(rest.length ? [{ title: copy.allCurrencies, data: rest }] : []),
  ];
}

export function filterCurrencyPickerSections(
  sections: readonly CurrencyPickerSection[],
  searchQuery: string,
): CurrencyPickerSection[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return [...sections];
  const data = sections.flatMap(section => section.data).filter(row => matchesQuery(row, query));
  return data.length ? [{ title: '', data }] : [];
}

/** Prefer live currency metadata, then static symbol tables, then the code itself. */
export function resolveCurrencySymbol(
  code: string,
  currencies: readonly PlainCurrency[],
  fallbackSymbols: Record<string, string> = {},
): string {
  return (
    currencies.find(currency => currency.code === code)?.symbol || fallbackSymbols[code] || code
  );
}
