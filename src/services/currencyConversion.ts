import { AppConfig } from '@/src/constants/app-config';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { roundToPrecision } from '@/src/utils/money';

export type ConversionMode = 'historical' | 'spot';

type ConvertAmountBaseInput = {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  precision?: number;
};

export type ConvertAmountInput = ConvertAmountBaseInput &
  (
    | {
        mode: 'historical';
        storedExchangeRate?: number;
        /** Required event date for historical conversion. */
        rateDate: number;
      }
    | { mode: 'spot'; storedExchangeRate?: never; rateDate?: never }
  );

export type ConvertAmountSuccess = { ok: true; amount: number };
export type ConvertAmountFailure = {
  ok: false;
  reason: 'missing_rate' | 'same_currency';
};
export type ConvertAmountResult = ConvertAmountSuccess | ConvertAmountFailure;

function isValidRate(rate: number | undefined | null): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
}

function isSilentParityRate(fromCurrency: string, toCurrency: string, rate: number): boolean {
  return fromCurrency !== toCurrency && rate === 1.0;
}

/** True when a stored rate can be used for unlike currencies without a historical lookup. */
export function isUsableCrossCurrencyRate(
  fromCurrency: string,
  toCurrency: string,
  rate: number | undefined | null,
): rate is number {
  return isValidRate(rate) && !isSilentParityRate(fromCurrency, toCurrency, rate);
}

/**
 * Single entry point for currency conversion (ADR-0005).
 * Never treats a missing cross-currency rate as 1.0.
 */
export async function convertAmount(input: ConvertAmountInput): Promise<ConvertAmountResult> {
  const {
    amount,
    fromCurrency,
    toCurrency,
    mode,
    storedExchangeRate,
    rateDate,
    precision = AppConfig.constants.precision,
  } = input;

  if (!fromCurrency || !toCurrency) {
    return { ok: false, reason: 'missing_rate' };
  }

  if (mode === 'historical' && rateDate === undefined) {
    return { ok: false, reason: 'missing_rate' };
  }

  if (fromCurrency === toCurrency) {
    return { ok: true, amount: roundToPrecision(amount, precision) };
  }

  if (mode === 'historical') {
    let historicalRate: number | undefined;
    if (isValidRate(storedExchangeRate)) {
      historicalRate = storedExchangeRate;
    } else {
      try {
        historicalRate = (
          await exchangeRateService.getHistoricalRate(fromCurrency, toCurrency, rateDate)
        ).rate;
      } catch {
        return { ok: false, reason: 'missing_rate' };
      }
    }
    if (!isValidRate(historicalRate)) {
      return { ok: false, reason: 'missing_rate' };
    }
    return {
      ok: true,
      amount: roundToPrecision(amount * historicalRate, precision),
    };
  }

  const rate = await exchangeRateService.getRate(fromCurrency, toCurrency);
  if (!isUsableCrossCurrencyRate(fromCurrency, toCurrency, rate)) {
    return { ok: false, reason: 'missing_rate' };
  }
  return { ok: true, amount: roundToPrecision(amount * rate, precision) };
}

export type JournalLineConversionInput = {
  amount: number;
  lineCurrency: string;
  journalCurrency: string;
  targetCurrency: string;
  storedLineRate?: number;
  journalDate: number;
  /** Optional override for the final amount's currency precision. */
  targetPrecision?: number;
};

export type JournalLineConversionResult =
  | ConvertAmountSuccess
  | {
      ok: false;
      reason: 'missing_rate';
      missingRate: { fromCurrency: string; toCurrency: string };
    };

/** Converts a journal line through its saved journal currency using the journal-date valuation. */
export async function convertJournalLineAmount(
  input: JournalLineConversionInput,
): Promise<JournalLineConversionResult> {
  const {
    amount,
    lineCurrency,
    journalCurrency,
    targetCurrency,
    storedLineRate,
    journalDate,
    targetPrecision,
  } = input;

  const lineToJournal = await convertAmount({
    amount,
    fromCurrency: lineCurrency,
    toCurrency: journalCurrency,
    mode: 'historical',
    storedExchangeRate: storedLineRate,
    rateDate: journalDate,
    precision: getCurrencyPrecision(journalCurrency),
  });
  if (!lineToJournal.ok) {
    return {
      ok: false,
      reason: 'missing_rate',
      missingRate: { fromCurrency: lineCurrency, toCurrency: journalCurrency },
    };
  }

  const journalToTarget = await convertAmount({
    amount: lineToJournal.amount,
    fromCurrency: journalCurrency,
    toCurrency: targetCurrency,
    mode: 'historical',
    rateDate: journalDate,
    precision: targetPrecision ?? getCurrencyPrecision(targetCurrency),
  });
  if (!journalToTarget.ok) {
    return {
      ok: false,
      reason: 'missing_rate',
      missingRate: { fromCurrency: journalCurrency, toCurrency: targetCurrency },
    };
  }

  return journalToTarget;
}
