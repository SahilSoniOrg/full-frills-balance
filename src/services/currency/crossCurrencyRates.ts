export type FetchCurrencyRate = (
  fromCurrency: string,
  toCurrency: string,
) => Promise<number | null>;

export interface CrossCurrencyRates {
  sourceBaseRate: number;
  destBaseRate: number;
  exchangeRate: number;
}

function isAvailableRate(rate: number | null): rate is number {
  return rate !== null && Number.isFinite(rate) && rate > 0;
}

/** Resolves both workplace-relative rates and the source-to-destination cross-rate. */
export async function fetchCrossCurrencyRates(
  sourceCurrency: string,
  destCurrency: string,
  workplaceCurrency: string,
  fetchRate: FetchCurrencyRate,
): Promise<CrossCurrencyRates | null> {
  if (sourceCurrency === destCurrency) {
    if (sourceCurrency === workplaceCurrency) return null;

    const baseRate = await fetchRate(sourceCurrency, workplaceCurrency);
    if (!isAvailableRate(baseRate)) return null;
    return {
      sourceBaseRate: baseRate,
      destBaseRate: baseRate,
      exchangeRate: 1,
    };
  }

  const [sourceBaseRate, destBaseRate] = await Promise.all([
    sourceCurrency === workplaceCurrency
      ? Promise.resolve(1)
      : fetchRate(sourceCurrency, workplaceCurrency),
    destCurrency === workplaceCurrency
      ? Promise.resolve(1)
      : fetchRate(destCurrency, workplaceCurrency),
  ]);

  if (!isAvailableRate(sourceBaseRate) || !isAvailableRate(destBaseRate)) return null;

  return {
    sourceBaseRate,
    destBaseRate,
    exchangeRate: sourceBaseRate / destBaseRate,
  };
}
