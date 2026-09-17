import {
  hasManualBaseRateDraft,
  parseManualBaseRate,
  resolveManualWorkplaceRates,
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
