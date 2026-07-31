import { amountInBaseCurrency, buildDayNetStats } from '../buildDayNetStats';

describe('buildDayNetStats', () => {
  it('sums signed base amounts with precision', () => {
    const stats = buildDayNetStats([{ n: 10 }, { n: -3 }, { n: 0 }], 'USD', 2, item => item.n);
    expect(stats).toEqual({ count: 3, netAmount: 7, currencyCode: 'USD' });
  });
});

describe('amountInBaseCurrency', () => {
  it('returns amount when already base', () => {
    expect(amountInBaseCurrency(50, 'USD', 'USD', {})).toBe(50);
  });

  it('divides by rate when foreign', () => {
    expect(amountInBaseCurrency(100, 'EUR', 'USD', { EUR: 2 })).toBe(50);
  });

  it('returns 0 when rate missing', () => {
    expect(amountInBaseCurrency(100, 'EUR', 'USD', {})).toBe(0);
  });
});
