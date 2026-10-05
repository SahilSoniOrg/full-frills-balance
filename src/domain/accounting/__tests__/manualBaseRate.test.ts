import {
  formatManualBaseRate,
  hasManualBaseRateDraft,
  resolveManualWorkplaceRates,
  resolveWorkplaceRatesFromConvertedAmount,
} from '@/src/domain/accounting/manualBaseRate';

describe('resolveManualWorkplaceRates draft parsing', () => {
  it('rejects empty, trailing-dot, and non-positive drafts', () => {
    expect(resolveManualWorkplaceRates('EUR', 'USD', 'USD', '', '')).toBeNull();
    expect(resolveManualWorkplaceRates('EUR', 'USD', 'USD', '1.', '')).toBeNull();
    expect(resolveManualWorkplaceRates('EUR', 'USD', 'USD', '.', '')).toBeNull();
    expect(resolveManualWorkplaceRates('EUR', 'USD', 'USD', '0', '')).toBeNull();
    expect(resolveManualWorkplaceRates('EUR', 'USD', 'USD', '1.2.3', '')).toBeNull();
  });

  it('accepts finished positive rates', () => {
    expect(resolveManualWorkplaceRates('EUR', 'USD', 'USD', '1', '')).toEqual({
      sourceBaseRate: 1,
      destBaseRate: 1,
    });
    expect(resolveManualWorkplaceRates('EUR', 'USD', 'USD', '1.25', '')).toEqual({
      sourceBaseRate: 1.25,
      destBaseRate: 1,
    });
    expect(resolveManualWorkplaceRates('EUR', 'USD', 'USD', '.5', '')).toEqual({
      sourceBaseRate: 0.5,
      destBaseRate: 1,
    });
  });
});

describe('resolveManualWorkplaceRates', () => {
  it('uses one foreign rate when destination is workplace currency', () => {
    expect(resolveManualWorkplaceRates('EUR', 'USD', 'USD', '1.25', '')).toEqual({
      sourceBaseRate: 1.25,
      destBaseRate: 1,
    });
  });

  it('uses one rate for equal foreign currencies', () => {
    expect(resolveManualWorkplaceRates('EUR', 'EUR', 'USD', '1.1', 'ignored')).toEqual({
      sourceBaseRate: 1.1,
      destBaseRate: 1.1,
    });
  });
});

describe('hasManualBaseRateDraft', () => {
  it('is true while the user is mid-keystroke', () => {
    expect(hasManualBaseRateDraft('EUR', 'USD', 'USD', '1.', '')).toBe(true);
    expect(hasManualBaseRateDraft('EUR', 'USD', 'USD', '', '')).toBe(false);
  });
});

describe('resolveWorkplaceRatesFromConvertedAmount', () => {
  it('sets the source workplace rate when destination is the workplace currency', () => {
    expect(
      resolveWorkplaceRatesFromConvertedAmount({
        sourceAmount: 50,
        convertedAmount: 4797.73,
        sourceCurrency: 'USD',
        destCurrency: 'INR',
        workplaceCurrency: 'INR',
      }),
    ).toEqual({
      sourceBaseRate: 4797.73 / 50,
      destBaseRate: 1,
    });
  });

  it('sets the destination workplace rate when source is the workplace currency', () => {
    expect(
      resolveWorkplaceRatesFromConvertedAmount({
        sourceAmount: 100,
        convertedAmount: 80,
        sourceCurrency: 'USD',
        destCurrency: 'EUR',
        workplaceCurrency: 'USD',
      }),
    ).toEqual({
      sourceBaseRate: 1,
      destBaseRate: 1 / 0.8,
    });
  });

  it('keeps the destination API rate and solves source when both currencies are foreign', () => {
    expect(
      resolveWorkplaceRatesFromConvertedAmount({
        sourceAmount: 100,
        convertedAmount: 90,
        sourceCurrency: 'EUR',
        destCurrency: 'GBP',
        workplaceCurrency: 'USD',
        existingSourceBaseRate: 1.1,
        existingDestBaseRate: 1.25,
      }),
    ).toEqual({
      sourceBaseRate: 1.25 * 0.9,
      destBaseRate: 1.25,
    });
  });

  it('returns null when a cross rate cannot be implied', () => {
    expect(
      resolveWorkplaceRatesFromConvertedAmount({
        sourceAmount: 0,
        convertedAmount: 90,
        sourceCurrency: 'USD',
        destCurrency: 'INR',
        workplaceCurrency: 'INR',
      }),
    ).toBeNull();
    expect(
      resolveWorkplaceRatesFromConvertedAmount({
        sourceAmount: 100,
        convertedAmount: 90,
        sourceCurrency: 'EUR',
        destCurrency: 'GBP',
        workplaceCurrency: 'USD',
      }),
    ).toBeNull();
  });

  it('formats manual rates the way the rate hook parses them', () => {
    expect(
      resolveManualWorkplaceRates('EUR', 'USD', 'USD', formatManualBaseRate(95.9546), '')
        ?.sourceBaseRate,
    ).toBeCloseTo(95.9546);
  });
});
