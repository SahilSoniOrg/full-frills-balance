import { fetchCrossCurrencyRates } from '@/src/services/currency/crossCurrencyRates';

describe('fetchCrossCurrencyRates', () => {
  it('resolves workplace-relative rates and the cross-rate once', async () => {
    const fetchRate = jest.fn(async (from: string) => (from === 'USD' ? 1.1 : 1.25));

    await expect(fetchCrossCurrencyRates('USD', 'EUR', 'INR', fetchRate)).resolves.toEqual({
      sourceBaseRate: 1.1,
      destBaseRate: 1.25,
      exchangeRate: 1.1 / 1.25,
    });
    expect(fetchRate).toHaveBeenCalledWith('USD', 'INR');
    expect(fetchRate).toHaveBeenCalledWith('EUR', 'INR');
  });

  it('does not fetch when both currencies are the same', async () => {
    const fetchRate = jest.fn(async () => 1);
    await expect(fetchCrossCurrencyRates('INR', 'INR', 'INR', fetchRate)).resolves.toBeNull();
    expect(fetchRate).not.toHaveBeenCalled();
  });
});
