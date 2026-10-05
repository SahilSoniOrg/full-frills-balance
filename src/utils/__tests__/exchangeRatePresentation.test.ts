import { resolveExchangeRatePresentation } from '@/src/utils/exchangeRatePresentation';

describe('resolveExchangeRatePresentation', () => {
  it('inverts a sub-one INR to USD multiplier into a readable USD to INR quote', () => {
    expect(
      resolveExchangeRatePresentation({
        sourceCurrency: 'INR',
        destinationCurrency: 'USD',
        exchangeRate: 0.0105,
      }),
    ).toEqual({
      sourceCurrency: 'USD',
      destinationCurrency: 'INR',
      exchangeRate: 1 / 0.0105,
    });
  });

  it('keeps rates of one or more in their conversion direction', () => {
    expect(
      resolveExchangeRatePresentation({
        sourceCurrency: 'USD',
        destinationCurrency: 'INR',
        exchangeRate: 95.2,
      }),
    ).toEqual({
      sourceCurrency: 'USD',
      destinationCurrency: 'INR',
      exchangeRate: 95.2,
    });
  });
});
