import {
  formatManualBaseRate,
  hasManualBaseRateDraft,
  parseManualBaseRate,
  resolveManualWorkplaceRates,
  resolveWorkplaceRatesFromConvertedAmount,
} from '@/src/features/journal/entry/manualBaseRate';

describe('parseManualBaseRate', () => {
  it('rejects empty, trailing-dot, and non-positive drafts', () => {
    expect(parseManualBaseRate('')).toBeNull();
    expect(parseManualBaseRate('1.')).toBeNull();
    expect(parseManualBaseRate('.')).toBeNull();
    expect(parseManualBaseRate('0')).toBeNull();
    expect(parseManualBaseRate('1.2.3')).toBeNull();
  });

  it('accepts finished positive rates', () => {
    expect(parseManualBaseRate('1')).toBe(1);
    expect(parseManualBaseRate('1.25')).toBe(1.25);
    expect(parseManualBaseRate('.5')).toBe(0.5);
  });
});

describe('resolveManualWorkplaceRates', () => {
  it('uses one foreign rate when destination is workplace currency', () => {
    expect(resolveManualWorkplaceRates('EUR', 'USD', 'USD', '1.25', '')).toEqual({
      sourceBaseRate: 1.25,
      destBaseRate: 1,
      exchangeRate: 1.25,
    });
  });

  it('uses one rate for equal foreign currencies', () => {
    expect(resolveManualWorkplaceRates('EUR', 'EUR', 'USD', '1.1', 'ignored')).toEqual({
      sourceBaseRate: 1.1,
      destBaseRate: 1.1,
      exchangeRate: 1,
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
      exchangeRate: 4797.73 / 50,
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
      exchangeRate: 0.8,
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
      exchangeRate: 0.9,
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
    expect(parseManualBaseRate(formatManualBaseRate(95.9546))).toBeCloseTo(95.9546);
  });
});
