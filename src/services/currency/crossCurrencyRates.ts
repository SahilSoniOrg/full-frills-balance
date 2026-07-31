export type FetchCurrencyRate = (fromCurrency: string, toCurrency: string) => Promise<number>;

export interface CrossCurrencyRates {
  sourceBaseRate: number;
  destBaseRate: number;
  exchangeRate: number;
}

/** Resolves both workplace-relative rates and the source-to-destination cross-rate. */
export async function fetchCrossCurrencyRates(
  sourceCurrency: string,
  destCurrency: string,
  workplaceCurrency: string,
  fetchRate: FetchCurrencyRate,
): Promise<CrossCurrencyRates | null> {
  if (sourceCurrency === destCurrency) return null;

  const [sourceBaseRate, destBaseRate] = await Promise.all([
    sourceCurrency === workplaceCurrency
      ? Promise.resolve(1)
      : fetchRate(sourceCurrency, workplaceCurrency),
    destCurrency === workplaceCurrency
      ? Promise.resolve(1)
      : fetchRate(destCurrency, workplaceCurrency),
  ]);

  return {
    sourceBaseRate,
    destBaseRate,
    exchangeRate: sourceBaseRate / destBaseRate,
  };
}
