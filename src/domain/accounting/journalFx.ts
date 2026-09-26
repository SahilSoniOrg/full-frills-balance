import { fromMinorUnits, toMinorUnits } from '@/src/utils/money';

export type JournalFxRateSource = 'identity' | 'imported' | 'missing' | 'invalid';

export interface JournalFxRateResolution {
  readonly rate?: number;
  readonly source: JournalFxRateSource;
}

function positiveRate(value: string | number | null | undefined): number | undefined {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return undefined;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

/** Resolve the rate for one account-currency line, preserving an explicit imported rate. */
export function resolveJournalFxRate(input: {
  accountCurrency: string;
  journalCurrency: string;
  importedRate?: string | number | null;
}): JournalFxRateResolution {
  const accountCurrency = input.accountCurrency.trim().toUpperCase();
  const journalCurrency = input.journalCurrency.trim().toUpperCase();
  if (accountCurrency && accountCurrency === journalCurrency) {
    return { rate: 1, source: 'identity' };
  }

  const importedRate = positiveRate(input.importedRate);
  if (importedRate !== undefined) return { rate: importedRate, source: 'imported' };

  return {
    source:
      input.importedRate == null ||
      (typeof input.importedRate === 'string' && input.importedRate.trim() === '')
        ? 'missing'
        : 'invalid',
  };
}

/** Normalize a currency amount with the same minor-unit rounding used by balance evaluation. */
export function normalizeCurrencyAmount(
  amount: number,
  precision: number,
): { amount: number; minorUnits: number } {
  const minorUnits = toMinorUnits(amount, precision);
  return { amount: fromMinorUnits(minorUnits, precision), minorUnits };
}

/** Convert a native amount into journal currency using the journal's minor-unit precision. */
export function convertJournalCurrencyAmount(input: {
  nativeAmount: number;
  nativePrecision: number;
  exchangeRate: number;
  journalPrecision: number;
}): {
  nativeAmount: number;
  nativeAmountMinorUnits: number;
  journalAmount: number;
  journalAmountMinorUnits: number;
} {
  const native = normalizeCurrencyAmount(input.nativeAmount, input.nativePrecision);
  const journal = normalizeCurrencyAmount(
    native.amount * input.exchangeRate,
    input.journalPrecision,
  );
  return {
    nativeAmount: native.amount,
    nativeAmountMinorUnits: native.minorUnits,
    journalAmount: journal.amount,
    journalAmountMinorUnits: journal.minorUnits,
  };
}

/** The displayed local journal day used by historical FX lookups. */
export function getJournalFxDateKey(journalDate: number): string | undefined {
  const date = new Date(journalDate);
  if (!Number.isFinite(journalDate) || Number.isNaN(date.getTime())) return undefined;
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Convert a local journal-date key into the UTC-midnight timestamp expected by the rate service. */
export function getHistoricalFxTimestamp(dateKey: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return undefined;
  const timestamp = Date.parse(`${dateKey}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== dateKey) {
    return undefined;
  }
  return timestamp;
}

export function getJournalHistoricalFxTimestamp(journalDate: number): number | undefined {
  const dateKey = getJournalFxDateKey(journalDate);
  return dateKey ? getHistoricalFxTimestamp(dateKey) : undefined;
}
