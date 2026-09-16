import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { convertAmount } from '../currencyConversion';

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    getHistoricalRate: jest.fn(),
    getRate: jest.fn(),
  },
}));

describe('currency conversion historical dates', () => {
  it('uses the requested historical date instead of the spot-rate path', async () => {
    jest.mocked(exchangeRateService.getHistoricalRate).mockResolvedValue({
      rate: 2,
      requestedDate: 100,
      effectiveDate: 100,
      source: 'test',
    });

    await expect(
      convertAmount({
        amount: 10,
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        mode: 'historical',
        rateDate: 100,
      }),
    ).resolves.toEqual({ ok: true, amount: 20 });
    expect(exchangeRateService.getHistoricalRate).toHaveBeenCalledWith('EUR', 'USD', 100);
    expect(exchangeRateService.getRate).not.toHaveBeenCalled();
  });

  it('ignores a stored silent 1.0 rate and looks up the historical quote', async () => {
    jest.mocked(exchangeRateService.getHistoricalRate).mockResolvedValue({
      rate: 83,
      requestedDate: 100,
      effectiveDate: 100,
      source: 'test',
    });

    await expect(
      convertAmount({
        amount: 10,
        fromCurrency: 'USD',
        toCurrency: 'INR',
        mode: 'historical',
        storedExchangeRate: 1,
        rateDate: 100,
      }),
    ).resolves.toEqual({ ok: true, amount: 830 });
    expect(exchangeRateService.getHistoricalRate).toHaveBeenCalledWith('USD', 'INR', 100);
  });
});
