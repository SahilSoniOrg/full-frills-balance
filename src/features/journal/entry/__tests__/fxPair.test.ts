import {
  NO_FX_OVERRIDE,
  RATE_UNAVAILABLE,
  resolveFxPair,
  withConvertedAmount,
  withManualBaseRate,
  type FxFetchedRates,
} from '@/src/features/journal/entry/fxPair';

const fetched = (
  sourceBaseRate: number | null,
  destBaseRate: number | null,
  overrides: Partial<FxFetchedRates> = {},
): FxFetchedRates => ({
  sourceBaseRate,
  destBaseRate,
  isLoading: false,
  error: null,
  ...overrides,
});

describe('resolveFxPair', () => {
  it('derives the pair rate and converted amount from fetched base rates', () => {
    const pair = resolveFxPair({
      sourceCurrency: 'EUR',
      destCurrency: 'GBP',
      baseCurrency: 'USD',
      fetched: fetched(1.1, 1.25),
      sourceAmount: 100,
    });

    expect(pair).toMatchObject({
      isCrossCurrency: true,
      needsBaseRate: true,
      sourceBaseRate: 1.1,
      destBaseRate: 1.25,
      status: 'resolved',
      rateError: null,
      needsManualRates: false,
    });
    expect(pair.pairRate).toBeCloseTo(0.88);
    expect(pair.convertedAmount).toBeCloseTo(88);
    expect(
      resolveFxPair({
        sourceCurrency: 'EUR',
        destCurrency: 'GBP',
        baseCurrency: 'USD',
        fetched: fetched(1.1, 1.25),
      }).convertedAmount,
    ).toBeNull();
  });

  it('pins base-currency legs to 1 and shares one rate for equal foreign currencies', () => {
    expect(
      resolveFxPair({
        sourceCurrency: 'USD',
        destCurrency: 'INR',
        baseCurrency: 'INR',
        fetched: fetched(83, null),
      }),
    ).toMatchObject({ sourceBaseRate: 83, destBaseRate: 1, pairRate: 83 });

    expect(
      resolveFxPair({
        sourceCurrency: 'USD',
        destCurrency: 'USD',
        baseCurrency: 'INR',
        saved: { sourceRate: '', destRate: '95.51' },
      }),
    ).toMatchObject({
      isCrossCurrency: false,
      needsBaseRate: true,
      sourceBaseRate: 95.51,
      destBaseRate: 95.51,
      pairRate: 1,
      convertedAmount: null,
    });
  });

  it('prefers saved line rates over fetched rates per leg', () => {
    const pair = resolveFxPair({
      sourceCurrency: 'EUR',
      destCurrency: 'GBP',
      baseCurrency: 'USD',
      fetched: fetched(1.1, 1.25),
      saved: { sourceRate: '1.2', destRate: '' },
    });

    expect(pair.sourceBaseRate).toBe(1.2);
    expect(pair.destBaseRate).toBe(1.25);
  });

  it('reports loading and unavailable fetch states', () => {
    const base = { sourceCurrency: 'EUR', destCurrency: 'USD', baseCurrency: 'USD' };

    expect(
      resolveFxPair({ ...base, fetched: fetched(null, null, { isLoading: true }) }).status,
    ).toBe('loading');
    expect(
      resolveFxPair({ ...base, fetched: fetched(null, null, { error: RATE_UNAVAILABLE }) }),
    ).toMatchObject({
      status: 'unavailable',
      rateError: RATE_UNAVAILABLE,
      needsManualRates: true,
      pairRate: null,
      convertedAmount: null,
    });
  });

  it('returns an idle empty pair until both currencies are known', () => {
    expect(
      resolveFxPair({
        sourceCurrency: 'EUR',
        baseCurrency: 'USD',
        fetched: fetched(null, null, { error: RATE_UNAVAILABLE }),
        override: { kind: 'manualBase', source: '1.1', dest: '', lastResolved: null },
      }),
    ).toMatchObject({
      isCrossCurrency: false,
      status: 'idle',
      pairRate: null,
      needsManualRates: false,
    });
  });
});

describe('manual base-rate override', () => {
  const unavailable = {
    sourceCurrency: 'EUR',
    destCurrency: 'USD',
    baseCurrency: 'USD',
    fetched: fetched(null, null, { error: RATE_UNAVAILABLE }),
    sourceAmount: 100,
  };

  it('resolves typed rates and clears the fetch error', () => {
    const pair = resolveFxPair(unavailable);
    const override = withManualBaseRate(pair, 'source', '1.2');

    expect(resolveFxPair({ ...unavailable, override })).toMatchObject({
      sourceBaseRate: 1.2,
      destBaseRate: 1,
      pairRate: 1.2,
      convertedAmount: 120,
      rateError: null,
      needsManualRates: true,
      manualSourceBaseRate: '1.2',
    });
  });

  it('keeps the previous rate while a draft is mid-keystroke', () => {
    let pair = resolveFxPair(unavailable);
    pair = resolveFxPair({ ...unavailable, override: withManualBaseRate(pair, 'source', '1') });
    pair = resolveFxPair({ ...unavailable, override: withManualBaseRate(pair, 'source', '1.') });

    expect(pair).toMatchObject({ pairRate: 1, manualSourceBaseRate: '1.', rateError: null });

    pair = resolveFxPair({ ...unavailable, override: withManualBaseRate(pair, 'source', '1.25') });
    expect(pair.pairRate).toBe(1.25);
  });

  it('falls back to fetched rates once every draft is cleared', () => {
    const pair = resolveFxPair({
      ...unavailable,
      override: { kind: 'manualBase', source: '', dest: '', lastResolved: null },
    });

    expect(pair).toMatchObject({ pairRate: null, rateError: RATE_UNAVAILABLE });
  });
});

describe('converted-amount override', () => {
  it('locks the implied rate so later source amounts keep it', () => {
    const input = {
      sourceCurrency: 'USD',
      destCurrency: 'INR',
      baseCurrency: 'INR',
      fetched: fetched(95.9546, null),
      sourceAmount: 50,
    };
    const override = withConvertedAmount(resolveFxPair(input), 4800);

    expect(override).toEqual({ kind: 'converted', rates: { sourceBaseRate: 96, destBaseRate: 1 } });

    const pair = resolveFxPair({ ...input, override: override!, sourceAmount: 100 });
    expect(pair).toMatchObject({
      pairRate: 96,
      convertedAmount: 9600,
      needsManualRates: false,
      manualSourceBaseRate: '96.000000',
      manualDestBaseRate: '',
    });
  });

  it('anchors on the destination rate when both legs are foreign', () => {
    const input = {
      sourceCurrency: 'EUR',
      destCurrency: 'GBP',
      baseCurrency: 'USD',
      fetched: fetched(1.1, 1.25),
      sourceAmount: 100,
    };

    expect(withConvertedAmount(resolveFxPair(input), 90)).toEqual({
      kind: 'converted',
      rates: { sourceBaseRate: 1.25 * 0.9, destBaseRate: 1.25 },
    });
  });

  it('returns null when no rate can be implied', () => {
    const pair = resolveFxPair({
      sourceCurrency: 'EUR',
      destCurrency: 'GBP',
      baseCurrency: 'USD',
      sourceAmount: 100,
      override: NO_FX_OVERRIDE,
    });

    expect(withConvertedAmount(pair, 90)).toBeNull();
    expect(withConvertedAmount({ ...pair, sourceAmount: 0 }, 90)).toBeNull();
  });

  it('turns back into a manual override when a manual field is edited', () => {
    const input = {
      sourceCurrency: 'EUR',
      destCurrency: 'GBP',
      baseCurrency: 'USD',
      fetched: fetched(1.1, 1.25),
      sourceAmount: 100,
    };
    const converted = resolveFxPair({
      ...input,
      override: withConvertedAmount(resolveFxPair(input), 90)!,
    });

    const override = withManualBaseRate(converted, 'source', '1.3');
    expect(override).toMatchObject({ kind: 'manualBase', source: '1.3', dest: '1.250000' });
    expect(resolveFxPair({ ...input, override }).pairRate).toBeCloseTo(1.3 / 1.25);
  });
});
