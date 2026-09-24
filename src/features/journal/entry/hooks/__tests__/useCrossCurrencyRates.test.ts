import {
  currencyPairKey,
  useCrossCurrencyRates,
  useCrossCurrencyRatesMap,
} from '@/src/features/journal/entry/hooks/useCrossCurrencyRates';
import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockFetchRate = jest.fn();
const mockFetchHistoricalRate = jest.fn();
jest.mock('@/src/hooks/useExchangeRate', () => ({
  useExchangeRate: () => ({
    fetchRate: mockFetchRate,
    fetchRequiredRate: mockFetchRate,
    fetchHistoricalRate: mockFetchHistoricalRate,
  }),
}));

describe('useCrossCurrencyRates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchRate.mockResolvedValue(1.0);
    mockFetchHistoricalRate.mockReset();
  });

  it('fetches cross-currency base rates relative to workplace currency', async () => {
    mockFetchRate.mockImplementation(async (from: string) => {
      if (from === 'EUR') return 1.1;
      if (from === 'GBP') return 1.25;
      return 1;
    });

    const { result } = renderHook(() =>
      useCrossCurrencyRates({
        sourceCurrency: 'EUR',
        destCurrency: 'GBP',
        workplaceCurrency: 'USD',
        enabled: true,
      }),
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current).toEqual({
        sourceBaseRate: 1.1,
        destBaseRate: 1.25,
        isLoading: false,
        error: null,
      });
    });
  });

  it('reports idle rates when disabled or same-currency', async () => {
    mockFetchRate.mockResolvedValue(1.1);

    const { result, rerender } = renderHook(
      (props: { sourceCurrency?: string; destCurrency?: string; enabled: boolean }) =>
        useCrossCurrencyRates({
          sourceCurrency: props.sourceCurrency,
          destCurrency: props.destCurrency,
          workplaceCurrency: 'USD',
          enabled: props.enabled,
        }),
      {
        initialProps: {
          sourceCurrency: 'EUR',
          destCurrency: 'USD',
          enabled: true,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.sourceBaseRate).toBe(1.1);
    });

    rerender({ sourceCurrency: 'USD', destCurrency: 'USD', enabled: true });
    expect(result.current).toEqual({
      sourceBaseRate: null,
      destBaseRate: null,
      isLoading: false,
      error: null,
    });

    rerender({ sourceCurrency: 'EUR', destCurrency: 'USD', enabled: false });
    expect(result.current.sourceBaseRate).toBeNull();
  });

  it('resolves a workplace-relative rate when both account currencies are foreign but equal', async () => {
    mockFetchRate.mockResolvedValue(95.51);

    const { result } = renderHook(() =>
      useCrossCurrencyRates({
        sourceCurrency: 'USD',
        destCurrency: 'USD',
        workplaceCurrency: 'INR',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.sourceBaseRate).toBe(95.51);
      expect(result.current.destBaseRate).toBe(95.51);
      expect(result.current.error).toBeNull();
    });
  });

  it('uses the journal date for a same-foreign-currency historical rate', async () => {
    mockFetchHistoricalRate.mockResolvedValue({ rate: 95.51 });

    const { result } = renderHook(() =>
      useCrossCurrencyRates({
        sourceCurrency: 'USD',
        destCurrency: 'USD',
        workplaceCurrency: 'INR',
        journalDate: '2024-10-03',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.sourceBaseRate).toBe(95.51);
      expect(result.current.destBaseRate).toBe(95.51);
    });
    expect(mockFetchHistoricalRate).toHaveBeenCalledWith(
      'USD',
      'INR',
      Date.parse('2024-10-03T00:00:00.000Z'),
    );
    expect(mockFetchRate).not.toHaveBeenCalled();
  });

  it('ignores stale rate resolutions when currencies change mid-fetch', async () => {
    let resolveFirst!: (val: number) => void;
    let resolveSecond!: (val: number) => void;

    const firstRatePromise = new Promise<number>(r => {
      resolveFirst = r;
    });
    const secondRatePromise = new Promise<number>(r => {
      resolveSecond = r;
    });

    mockFetchRate.mockReturnValueOnce(firstRatePromise).mockReturnValueOnce(secondRatePromise);

    const { result, rerender } = renderHook(
      (props: { sourceCurrency: string; destCurrency: string }) =>
        useCrossCurrencyRates({
          sourceCurrency: props.sourceCurrency,
          destCurrency: props.destCurrency,
          workplaceCurrency: 'USD',
          enabled: true,
        }),
      {
        initialProps: { sourceCurrency: 'EUR', destCurrency: 'USD' },
      },
    );

    expect(result.current.isLoading).toBe(true);

    rerender({ sourceCurrency: 'GBP', destCurrency: 'USD' });

    await act(async () => {
      resolveSecond(1.25);
      await secondRatePromise;
    });

    await waitFor(() => {
      expect(result.current.sourceBaseRate).toBe(1.25);
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      resolveFirst(1.1);
      await firstRatePromise;
    });

    expect(result.current.sourceBaseRate).toBe(1.25);
    expect(result.current.error).toBeNull();
  });

  it('does not apply rate state after unmount mid-fetch', async () => {
    let resolveRate!: (val: number) => void;
    const ratePromise = new Promise<number>(r => {
      resolveRate = r;
    });
    mockFetchRate.mockReturnValueOnce(ratePromise);

    const { result, unmount } = renderHook(() =>
      useCrossCurrencyRates({
        sourceCurrency: 'EUR',
        destCurrency: 'USD',
        workplaceCurrency: 'USD',
        enabled: true,
      }),
    );

    expect(result.current.isLoading).toBe(true);
    unmount();

    await act(async () => {
      resolveRate(1.1);
      await ratePromise;
    });
  });

  it.each([
    ['fetch fails', () => mockFetchRate.mockRejectedValueOnce(new Error('network'))],
    ['the required lookup reports no rate', () => mockFetchRate.mockResolvedValueOnce(null)],
  ])('surfaces Rate unavailable when %s', async (_label, arrange) => {
    arrange();

    const { result } = renderHook(() =>
      useCrossCurrencyRates({
        sourceCurrency: 'EUR',
        destCurrency: 'USD',
        workplaceCurrency: 'USD',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current).toEqual({
        sourceBaseRate: null,
        destBaseRate: null,
        isLoading: false,
        error: 'Rate unavailable',
      });
    });
  });

  it('clears the previous rate when a historical lookup fails after the journal date changes', async () => {
    mockFetchHistoricalRate
      .mockResolvedValueOnce({ rate: 1.1 })
      .mockRejectedValueOnce(new Error('network'));

    const { result, rerender } = renderHook(
      (props: { journalDate: string }) =>
        useCrossCurrencyRates({
          sourceCurrency: 'EUR',
          destCurrency: 'USD',
          workplaceCurrency: 'USD',
          journalDate: props.journalDate,
          enabled: true,
        }),
      { initialProps: { journalDate: '2024-10-03' } },
    );

    await waitFor(() => expect(result.current.sourceBaseRate).toBe(1.1));

    rerender({ journalDate: '2024-10-04' });

    await waitFor(() => {
      expect(result.current.error).toBe('Rate unavailable');
      expect(result.current.sourceBaseRate).toBeNull();
      expect(result.current.destBaseRate).toBeNull();
    });
  });

  it('refetches the same pair when the refresh nonce changes', async () => {
    mockFetchRate.mockResolvedValueOnce(1.1).mockResolvedValueOnce(1.2);

    const { result, rerender } = renderHook(
      (props: { refreshNonce: number }) =>
        useCrossCurrencyRates({
          sourceCurrency: 'EUR',
          destCurrency: 'USD',
          workplaceCurrency: 'USD',
          refreshNonce: props.refreshNonce,
          enabled: true,
        }),
      { initialProps: { refreshNonce: 0 } },
    );

    await waitFor(() => expect(result.current.sourceBaseRate).toBe(1.1));
    rerender({ refreshNonce: 1 });
    await waitFor(() => expect(result.current.sourceBaseRate).toBe(1.2));
    expect(mockFetchRate).toHaveBeenCalledTimes(2);
  });
});

describe('useCrossCurrencyRatesMap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchHistoricalRate.mockReset();
  });

  it('fetches each distinct pair once and keys results by pair', async () => {
    mockFetchRate.mockImplementation(async (from: string) => (from === 'EUR' ? 1.1 : 0.012));

    const { result } = renderHook(() =>
      useCrossCurrencyRatesMap({
        pairs: [
          { sourceCurrency: 'USD', destCurrency: 'EUR' },
          { sourceCurrency: 'USD', destCurrency: 'INR' },
          { sourceCurrency: 'USD', destCurrency: 'EUR' },
          { sourceCurrency: 'USD', destCurrency: 'USD' },
        ],
        workplaceCurrency: 'USD',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current[currencyPairKey('USD', 'EUR')]?.destBaseRate).toBe(1.1);
      expect(result.current[currencyPairKey('USD', 'INR')]?.destBaseRate).toBe(0.012);
    });
    expect(result.current[currencyPairKey('USD', 'USD')]).toBeUndefined();
    expect(mockFetchRate).toHaveBeenCalledTimes(2);
  });
});
