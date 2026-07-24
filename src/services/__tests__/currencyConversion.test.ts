import { convertAmount } from '@/src/services/currencyConversion';
import { exchangeRateService } from '@/src/services/exchange-rate-service';

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    getRate: jest.fn(),
  },
}));

const getRate = exchangeRateService.getRate as jest.Mock;

describe('convertAmount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns rounded amount when currencies match', async () => {
    const result = await convertAmount({
      amount: 10.555,
      fromCurrency: 'USD',
      toCurrency: 'USD',
      mode: 'spot',
    });
    expect(result).toEqual({ ok: true, amount: 10.56 });
    expect(getRate).not.toHaveBeenCalled();
  });

  it('historical mode uses stored exchange rate without calling getRate', async () => {
    const result = await convertAmount({
      amount: 100,
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      mode: 'historical',
      storedExchangeRate: 1.1,
    });
    expect(result).toEqual({ ok: true, amount: 110 });
    expect(getRate).not.toHaveBeenCalled();
  });

  it('historical mode falls back to getRate when stored rate is missing', async () => {
    getRate.mockResolvedValue(1.25);
    const result = await convertAmount({
      amount: 80,
      fromCurrency: 'GBP',
      toCurrency: 'USD',
      mode: 'historical',
    });
    expect(result).toEqual({ ok: true, amount: 100 });
    expect(getRate).toHaveBeenCalledWith('GBP', 'USD');
  });

  it('spot mode uses getRate', async () => {
    getRate.mockResolvedValue(82.5);
    const result = await convertAmount({
      amount: 2,
      fromCurrency: 'USD',
      toCurrency: 'INR',
      mode: 'spot',
    });
    expect(result).toEqual({ ok: true, amount: 165 });
    expect(getRate).toHaveBeenCalledWith('USD', 'INR');
  });

  it('returns missing_rate when getRate yields silent parity for unlike currencies', async () => {
    getRate.mockResolvedValue(1.0);
    const result = await convertAmount({
      amount: 50,
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      mode: 'spot',
    });
    expect(result).toEqual({ ok: false, reason: 'missing_rate' });
  });

  it('returns missing_rate for invalid stored historical rate and failed lookup', async () => {
    getRate.mockResolvedValue(1.0);
    const result = await convertAmount({
      amount: 50,
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      mode: 'historical',
      storedExchangeRate: 0,
    });
    expect(result).toEqual({ ok: false, reason: 'missing_rate' });
  });

  it('respects custom precision', async () => {
    getRate.mockResolvedValue(1.23456);
    const result = await convertAmount({
      amount: 10,
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      mode: 'spot',
      precision: 3,
    });
    expect(result).toEqual({ ok: true, amount: 12.346 });
  });
});
