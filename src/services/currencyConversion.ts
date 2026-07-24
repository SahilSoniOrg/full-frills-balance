import { AppConfig } from '@/src/constants/app-config';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { roundToPrecision } from '@/src/utils/money';

export type ConversionMode = 'historical' | 'spot';

export type ConvertAmountInput = {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  mode: ConversionMode;
  storedExchangeRate?: number;
  precision?: number;
};

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
    precision = AppConfig.constants.precision,
  } = input;

  if (fromCurrency === toCurrency) {
    return { ok: true, amount: roundToPrecision(amount, precision) };
  }

  if (!fromCurrency || !toCurrency) {
    return { ok: false, reason: 'missing_rate' };
  }

  let rate: number | undefined;

  if (mode === 'historical') {
    if (isValidRate(storedExchangeRate)) {
      rate = storedExchangeRate;
    } else {
      rate = await exchangeRateService.getRate(fromCurrency, toCurrency);
    }
  } else {
    rate = await exchangeRateService.getRate(fromCurrency, toCurrency);
  }

  if (!isValidRate(rate) || isSilentParityRate(fromCurrency, toCurrency, rate)) {
    return { ok: false, reason: 'missing_rate' };
  }

  return { ok: true, amount: roundToPrecision(amount * rate, precision) };
}
