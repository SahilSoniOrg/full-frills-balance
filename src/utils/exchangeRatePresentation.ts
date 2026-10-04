export function resolveExchangeRatePresentation(input: {
  sourceCurrency?: string;
  destinationCurrency?: string;
  exchangeRate: number;
}): {
  sourceCurrency?: string;
  destinationCurrency?: string;
  exchangeRate: number;
} {
  if (input.exchangeRate >= 1 || input.exchangeRate <= 0) return input;

  return {
    sourceCurrency: input.destinationCurrency,
    destinationCurrency: input.sourceCurrency,
    exchangeRate: 1 / input.exchangeRate,
  };
}
