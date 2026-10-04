function isSilentParityRate(fromCurrency: string, toCurrency: string, rate: number): boolean {
  return fromCurrency !== toCurrency && rate === 1.0;
}

/** Positive finite rate; optionally rejects silent 1.0 parity for unlike currencies. */
export function isUsableExchangeRate(
  rate: number | undefined | null,
  options?: { fromCurrency: string; toCurrency: string },
): rate is number {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return false;
  if (options) return !isSilentParityRate(options.fromCurrency, options.toCurrency, rate);
  return true;
}
