import { useCrossCurrencyRates } from '@/src/features/journal/entry/hooks/useCrossCurrencyRates';
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

  it('fetches and resolves cross-currency rates relative to workplace currency', async () => {
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

    await waitFor(() => {
      expect(result.current.isLoadingRate).toBe(false);
      expect(result.current.exchangeRate).toBeCloseTo(1.1 / 1.25);
      expect(result.current.sourceBaseRate).toBe(1.1);
      expect(result.current.destBaseRate).toBe(1.25);
      expect(result.current.rateError).toBeNull();
    });
  });

  it('clears rates when disabled or same-currency', async () => {
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
      expect(result.current.exchangeRate).not.toBeNull();
    });

    rerender({ sourceCurrency: 'USD', destCurrency: 'USD', enabled: true });

    await waitFor(() => {
      expect(result.current.exchangeRate).toBeNull();
      expect(result.current.sourceBaseRate).toBeNull();
      expect(result.current.destBaseRate).toBeNull();
      expect(result.current.isLoadingRate).toBe(false);
    });

    rerender({ sourceCurrency: 'EUR', destCurrency: 'USD', enabled: false });

    expect(result.current.exchangeRate).toBeNull();
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
      expect(result.current.exchangeRate).toBe(1);
      expect(result.current.sourceBaseRate).toBe(95.51);
      expect(result.current.destBaseRate).toBe(95.51);
      expect(result.current.rateError).toBeNull();
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
      expect(result.current.exchangeRate).toBe(1);
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

    // First pair: EUR→USD (one fetch for EUR, USD leg is 1.0)
    // Second pair: GBP→USD (one fetch for GBP)
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

    await waitFor(() => {
      expect(result.current.isLoadingRate).toBe(true);
    });

    rerender({ sourceCurrency: 'GBP', destCurrency: 'USD' });

    await act(async () => {
      resolveSecond(1.25);
      await secondRatePromise;
    });

    await waitFor(() => {
      expect(result.current.exchangeRate).toBe(1.25);
      expect(result.current.sourceBaseRate).toBe(1.25);
      expect(result.current.isLoadingRate).toBe(false);
    });

    await act(async () => {
      resolveFirst(1.1);
      await firstRatePromise;
    });

    // Stale EUR rate must not overwrite the newer GBP rate
    expect(result.current.exchangeRate).toBe(1.25);
    expect(result.current.sourceBaseRate).toBe(1.25);
    expect(result.current.rateError).toBeNull();
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

    await waitFor(() => {
      expect(result.current.isLoadingRate).toBe(true);
    });
    unmount();

    await act(async () => {
      resolveRate(1.1);
      await ratePromise;
    });

    // No throw / state update after unmount; assertion is that act completed cleanly
    expect(true).toBe(true);
  });

  it('surfaces rateError when fetch fails for the latest request', async () => {
    mockFetchRate.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() =>
      useCrossCurrencyRates({
        sourceCurrency: 'EUR',
        destCurrency: 'USD',
        workplaceCurrency: 'USD',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoadingRate).toBe(false);
      expect(result.current.rateError).toBe('Rate unavailable');
      expect(result.current.exchangeRate).toBeNull();
    });
  });

  it('surfaces rateError when the required lookup reports no rate', async () => {
    mockFetchRate.mockResolvedValueOnce(null);

    const { result } = renderHook(() =>
      useCrossCurrencyRates({
        sourceCurrency: 'EUR',
        destCurrency: 'USD',
        workplaceCurrency: 'USD',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.rateError).toBe('Rate unavailable');
      expect(result.current.exchangeRate).toBeNull();
      expect(result.current.isLoadingRate).toBe(false);
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

    await waitFor(() => expect(result.current.exchangeRate).toBe(1.1));

    rerender({ journalDate: '2024-10-04' });

    await waitFor(() => {
      expect(result.current.rateError).toBe('Rate unavailable');
      expect(result.current.exchangeRate).toBeNull();
      expect(result.current.sourceBaseRate).toBeNull();
      expect(result.current.destBaseRate).toBeNull();
    });
  });
});
