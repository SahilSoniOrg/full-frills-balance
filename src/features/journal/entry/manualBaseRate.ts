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
