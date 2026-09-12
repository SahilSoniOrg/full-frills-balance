import { renderHook, waitFor } from '@testing-library/react-native';
import { AccountType, TransactionType } from '@/src/types/enums';
import { useJournalEditorExchangeRates } from '../useJournalEditorExchangeRates';

const mockFetchRate = jest.fn();
const mockFetchHistoricalRate = jest.fn();

jest.mock('@/src/hooks/useExchangeRate', () => ({
  useExchangeRate: () => ({
    fetchRate: mockFetchRate,
    fetchHistoricalRate: mockFetchHistoricalRate,
  }),
}));

jest.mock('@/src/utils/alerts', () => ({
  showErrorAlert: jest.fn(),
}));

describe('useJournalEditorExchangeRates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fills missing foreign line rates from the journal date', async () => {
    mockFetchHistoricalRate.mockResolvedValue({ rate: 95.51 });
    const updateLines = jest.fn();
    const lines = [
      {
        id: 'source',
        accountId: 'source',
        accountName: 'Stock Sell PnL USD',
        accountType: AccountType.INCOME,
        accountCurrency: 'USD',
        amount: '5.99',
        transactionType: TransactionType.CREDIT,
        notes: '',
        exchangeRate: '',
      },
      {
        id: 'destination',
        accountId: 'destination',
        accountName: 'Fid US Stocks USD',
        accountType: AccountType.ASSET,
        accountCurrency: 'USD',
        amount: '5.99',
        transactionType: TransactionType.DEBIT,
        notes: '',
        exchangeRate: '',
      },
    ] as any;

    renderHook(() =>
      useJournalEditorExchangeRates({
        lines,
        workplaceCurrency: 'INR',
        journalDate: '2024-10-03',
        isLoading: false,
        isSubmitting: false,
        updateLines,
      }),
    );

    await waitFor(() => {
      expect(updateLines).toHaveBeenCalledWith({
        source: { exchangeRate: '95.51' },
        destination: { exchangeRate: '95.51' },
      });
    });
    expect(mockFetchHistoricalRate).toHaveBeenCalledTimes(2);
    expect(mockFetchHistoricalRate).toHaveBeenCalledWith(
      'USD',
      'INR',
      Date.parse('2024-10-03T00:00:00.000Z'),
    );
    expect(mockFetchRate).not.toHaveBeenCalled();
  });

  it('invalidates a populated foreign rate when the journal date changes', async () => {
    const updateLines = jest.fn();
    const lines = [
      {
        id: 'foreign-line',
        accountId: 'foreign-account',
        accountName: 'USD Account',
        accountType: AccountType.ASSET,
        accountCurrency: 'USD',
        amount: '5.99',
        transactionType: TransactionType.DEBIT,
        notes: '',
        exchangeRate: '83.966591',
      },
    ] as any;

    const { rerender } = renderHook(
      (props: { journalDate: string }) =>
        useJournalEditorExchangeRates({
          lines,
          workplaceCurrency: 'INR',
          journalDate: props.journalDate,
          isLoading: false,
          isSubmitting: false,
          updateLines,
        }),
      { initialProps: { journalDate: '2024-10-03' } },
    );

    rerender({ journalDate: '2024-10-04' });

    await waitFor(() => {
      expect(updateLines).toHaveBeenCalledWith({
        'foreign-line': { exchangeRate: '' },
      });
    });
  });

  it('invalidates a populated rate when the line currency changes', async () => {
    const updateLines = jest.fn();
    const initialLines = [
      {
        id: 'foreign-line',
        accountId: 'foreign-account',
        accountName: 'USD Account',
        accountType: AccountType.ASSET,
        accountCurrency: 'USD',
        amount: '5.99',
        transactionType: TransactionType.DEBIT,
        notes: '',
        exchangeRate: '83.966591',
      },
    ] as any;

    const { rerender } = renderHook(
      (props: { lines: any[] }) =>
        useJournalEditorExchangeRates({
          lines: props.lines,
          workplaceCurrency: 'INR',
          journalDate: '2024-10-03',
          isLoading: false,
          isSubmitting: false,
          updateLines,
        }),
      { initialProps: { lines: initialLines } },
    );

    rerender({
      lines: [{ ...initialLines[0], accountCurrency: 'EUR' }],
    });

    await waitFor(() => {
      expect(updateLines).toHaveBeenCalledWith({
        'foreign-line': { exchangeRate: '' },
      });
    });
  });
});
