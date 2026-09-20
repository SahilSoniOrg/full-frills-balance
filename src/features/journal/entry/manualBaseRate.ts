/** True when the string is a finished positive rate, not a mid-keystroke draft. */
export function parseManualBaseRate(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed.endsWith('.')) return null;
  if (!/^\d*\.?\d+$/.test(trimmed)) return null;
  const rate = Number.parseFloat(trimmed);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return rate;
}

export function hasManualBaseRateDraft(
  sourceCurrency: string,
  destCurrency: string,
  workplaceCurrency: string,
  manualSourceBaseRate?: string,
  manualDestBaseRate?: string,
): boolean {
  if (sourceCurrency !== workplaceCurrency && (manualSourceBaseRate ?? '').trim() !== '') {
    return true;
  }
  if (
    destCurrency !== workplaceCurrency &&
    destCurrency !== sourceCurrency &&
    (manualDestBaseRate ?? '').trim() !== ''
  ) {
    return true;
  }
  return false;
}

export function resolveManualWorkplaceRates(
  sourceCurrency: string,
  destCurrency: string,
  workplaceCurrency: string,
  manualSourceBaseRate?: string,
  manualDestBaseRate?: string,
): { sourceBaseRate: number; destBaseRate: number; exchangeRate: number } | null {
  const sourceRate =
    sourceCurrency === workplaceCurrency ? 1 : parseManualBaseRate(manualSourceBaseRate);
  const destinationRate =
    destCurrency === workplaceCurrency
      ? 1
      : sourceCurrency === destCurrency
        ? sourceRate
        : parseManualBaseRate(manualDestBaseRate);

  if (sourceRate == null || destinationRate == null) return null;
  return {
    sourceBaseRate: sourceRate,
    destBaseRate: destinationRate,
    exchangeRate: sourceRate / destinationRate,
  };
}

export function formatManualBaseRate(rate: number): string {
  return rate.toFixed(6);
}

/**
 * Derives workplace-relative rates from a user-edited destination amount.
 * The implied source→dest rate is what gets saved; API rates only seed the initial conversion.
 */
export function resolveWorkplaceRatesFromConvertedAmount(input: {
  sourceAmount: number;
  convertedAmount: number;
  sourceCurrency: string;
  destCurrency: string;
  workplaceCurrency: string;
  existingSourceBaseRate?: number | null;
  existingDestBaseRate?: number | null;
}): { sourceBaseRate: number; destBaseRate: number; exchangeRate: number } | null {
  const { sourceAmount, convertedAmount, sourceCurrency, destCurrency, workplaceCurrency } = input;
  if (sourceCurrency === destCurrency) return null;
  if (!(sourceAmount > 0) || !(convertedAmount > 0)) return null;
  if (!Number.isFinite(sourceAmount) || !Number.isFinite(convertedAmount)) return null;

  const exchangeRate = convertedAmount / sourceAmount;
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return null;

  if (destCurrency === workplaceCurrency) {
    return { sourceBaseRate: exchangeRate, destBaseRate: 1, exchangeRate };
  }
  if (sourceCurrency === workplaceCurrency) {
    return { sourceBaseRate: 1, destBaseRate: 1 / exchangeRate, exchangeRate };
  }

  const destBase =
    input.existingDestBaseRate != null && input.existingDestBaseRate > 0
      ? input.existingDestBaseRate
      : null;
  const sourceBase =
    input.existingSourceBaseRate != null && input.existingSourceBaseRate > 0
      ? input.existingSourceBaseRate
      : null;

  if (destBase != null) {
    return {
      sourceBaseRate: destBase * exchangeRate,
      destBaseRate: destBase,
      exchangeRate,
    };
  }
  if (sourceBase != null) {
    return {
      sourceBaseRate: sourceBase,
      destBaseRate: sourceBase / exchangeRate,
      exchangeRate,
    };
  }
  return null;
}
