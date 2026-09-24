import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import {
  resolveBulkRowFxPair,
  useBulkJournalEditor,
} from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import { journalService } from '@/src/services/journal/journalDomainService';
import { triggerSaveOutcomeHaptic } from '@/src/utils/haptics';
import { act, renderHook } from '@testing-library/react-native';

const mockFetchRate = jest.fn();
let mockFetchHistoricalRate: jest.Mock | undefined;
jest.mock('@/src/hooks/useExchangeRate', () => ({
  useExchangeRate: () => ({
    fetchRate: mockFetchRate,
    fetchRequiredRate: mockFetchRate,
    fetchHistoricalRate: mockFetchHistoricalRate,
  }),
}));

jest.mock('@/src/services/journal/journalDomainService', () => ({
  journalService: {
    saveBulkJournalEntries: jest.fn(),
  },
}));

jest.mock('@/src/utils/haptics', () => ({
  triggerSaveOutcomeHaptic: jest.fn(),
}));

jest.mock('@/src/services/analytics', () => ({
  analytics: { trackFeatureUsage: jest.fn() },
}));

describe('useBulkJournalEditor', () => {
  const accounts = [
    { id: 'acc1', name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
    { id: 'acc2', name: 'Food', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
    { id: 'acc3', name: 'EUR Bank', accountType: AccountType.ASSET, currencyCode: 'EUR' },
  ] as any;

  const onSaveSuccessMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchRate.mockResolvedValue(1.0);
  });

  afterEach(() => {
    jest.useRealTimers();
    mockFetchHistoricalRate = undefined;
  });

  it('ties a rounded destination amount back to the source amount', () => {
    const pair = resolveBulkRowFxPair(
      {
        id: 'row',
        description: '',
        notes: '',
        transactionType: 'transfer',
        amount: '600',
        sourceId: 'inr' as AccountId,
        destinationId: 'usd' as AccountId,
        journalDate: 0,
        exchangeRate: '',
        isCrossCurrency: true,
        convertedAmount: 0,
        isLoadingRate: false,
        fxRates: { sourceBaseRate: 1, destBaseRate: 95.96, isLoading: false, error: null },
      },
      [
        { id: 'inr', currencyCode: 'INR' },
        { id: 'usd', currencyCode: 'USD' },
      ] as any,
      'INR',
    );

    expect(pair.convertedAmount).toBeCloseTo(6.25, 2);
    expect(pair.convertedAmount! * pair.destBaseRate!).toBeCloseTo(600, 2);
  });

  it('initializes with a single empty row', () => {
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    expect(result.current.rows).toHaveLength(1);
    const firstRow = result.current.rows[0];
    expect(firstRow.description).toBe('');
    expect(firstRow.notes).toBe('');
    expect(firstRow.amount).toBe('');
    expect(firstRow.sourceId).toBe('');
    expect(firstRow.destinationId).toBe('');
    expect(firstRow.isCrossCurrency).toBe(false);
  });

  it('waits for one second of inactivity before persisting full-row validation', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    const rowId = result.current.rows[0].id;
    act(() => result.current.rowActions.setDescription(rowId, 'Coffee'));

    expect(result.current.rows[0].validationError).toBeUndefined();

    act(() => jest.advanceTimersByTime(999));
    expect(result.current.rows[0].validationError).toBeUndefined();

    act(() => jest.advanceTimersByTime(1));
    expect(result.current.rows[0].validationError).toBe('Amount must be greater than 0');
  });

  it('exposes named typed row actions instead of a loose field updater', () => {
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    expect(result.current.rowActions).toEqual(
      expect.objectContaining({
        setDescription: expect.any(Function),
        setNotes: expect.any(Function),
        setAmount: expect.any(Function),
        setJournalDate: expect.any(Function),
        setTransactionType: expect.any(Function),
        setSourceAccount: expect.any(Function),
        setDestinationAccount: expect.any(Function),
        setConvertedAmount: expect.any(Function),
        setManualBaseRate: expect.any(Function),
        applySuggestion: expect.any(Function),
      }),
    );
  });

  it('applies a description suggestion and fills its empty target account leg', () => {
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    const rowId = result.current.rows[0].id;
    act(() => {
      result.current.rowActions.setTransactionType(rowId, 'expense');
      result.current.rowActions.applySuggestion(rowId, {
        description: 'Lunch',
        count: 3,
        targetAccountId: 'acc2' as AccountId,
        targetAccountName: 'Food',
        targetAccountType: AccountType.EXPENSE,
      });
    });

    expect(result.current.rows[0]).toMatchObject({
      description: 'Lunch',
      destinationId: 'acc2',
    });
  });

  it('adds a row and auto-fills fields from the previous row', () => {
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    act(() => {
      result.current.rowActions.setDescription(result.current.rows[0].id, 'Lunch');
      result.current.rowActions.setNotes(result.current.rows[0].id, 'Office cafeteria');
      result.current.rowActions.setAmount(result.current.rows[0].id, '15.50');
      result.current.rowActions.setSourceAccount(result.current.rows[0].id, 'acc1' as AccountId);
      result.current.rowActions.setDestinationAccount(
        result.current.rows[0].id,
        'acc2' as AccountId,
      );
    });

    act(() => {
      result.current.addRow();
    });

    expect(result.current.rows).toHaveLength(2);
    const secondRow = result.current.rows[1];
    expect(secondRow.description).toBe('Lunch');
    expect(secondRow.notes).toBe('Office cafeteria');
    expect(secondRow.amount).toBe('15.50');
    expect(secondRow.sourceId).toBe('acc1');
    expect(secondRow.destinationId).toBe('acc2');
  });

  it('removes a row correctly', () => {
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    act(() => {
      result.current.addRow();
    });
    expect(result.current.rows).toHaveLength(2);

    const firstRowId = result.current.rows[0].id;
    act(() => {
      result.current.removeRow(firstRowId);
    });

    expect(result.current.rows).toHaveLength(1);
  });

  it('swaps source and destination accounts for a batch transfer row', () => {
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    const rowId = result.current.rows[0].id;
    act(() => {
      result.current.rowActions.setSourceAccount(rowId, 'acc1' as AccountId);
      result.current.rowActions.setDestinationAccount(rowId, 'acc2' as AccountId);
    });

    act(() => result.current.swapRowAccounts(rowId));

    expect(result.current.rows[0]).toMatchObject({
      sourceId: 'acc2',
      destinationId: 'acc1',
      sourceBaseRateInput: '',
      destBaseRateInput: '',
    });
  });

  it('shows the distinct-account validation as soon as both sides match', () => {
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    const rowId = result.current.rows[0].id;
    act(() => {
      result.current.rowActions.setSourceAccount(rowId, 'acc1' as AccountId);
      result.current.rowActions.setDestinationAccount(rowId, 'acc1' as AccountId);
    });

    expect(result.current.rows[0].validationError).toBe(
      'Source and destination accounts must be distinct',
    );
  });

  it('keeps an account validation visible while an unrelated field changes', () => {
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    const rowId = result.current.rows[0].id;
    act(() => {
      result.current.rowActions.setSourceAccount(rowId, 'acc1' as AccountId);
      result.current.rowActions.setDestinationAccount(rowId, 'acc1' as AccountId);
      result.current.rowActions.setDescription(rowId, 'Still invalid');
    });

    expect(result.current.rows[0].validationError).toBe(
      'Source and destination accounts must be distinct',
    );
  });

  it('caps rows at the bridge-safe bulk limit', () => {
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    act(() => {
      for (let index = 1; index < 100; index += 1) result.current.addRow();
    });

    expect(result.current.rows).toHaveLength(100);
    expect(result.current.isAtMaxRows).toBe(true);

    act(() => result.current.addRow());

    expect(result.current.rows).toHaveLength(100);
  });

  it('removing the last row resets to a single empty row', () => {
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    const onlyRowId = result.current.rows[0].id;
    act(() => {
      result.current.removeRow(onlyRowId);
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].description).toBe('');
    expect(result.current.rows[0].amount).toBe('');
  });

  it('detects cross-currency and fetches rate in background', async () => {
    mockFetchRate.mockResolvedValue(1.1);

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    await act(async () => {
      result.current.rowActions.setAmount(result.current.rows[0].id, '100');
      result.current.rowActions.setSourceAccount(result.current.rows[0].id, 'acc3' as AccountId);
      result.current.rowActions.setDestinationAccount(
        result.current.rows[0].id,
        'acc1' as AccountId,
      );
    });

    expect(mockFetchRate).toHaveBeenCalled();
    const updatedRow = result.current.rows[0];
    expect(updatedRow.isCrossCurrency).toBe(true);
    expect(updatedRow.exchangeRate).toBe('1.100000');
    expect(updatedRow.convertedAmount).toBe(110);
  });

  it('recalculates convertedAmount when amount changes for cross-currency row', async () => {
    mockFetchRate.mockResolvedValue(1.1);

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    await act(async () => {
      result.current.rowActions.setSourceAccount(result.current.rows[0].id, 'acc3' as AccountId);
      result.current.rowActions.setDestinationAccount(
        result.current.rows[0].id,
        'acc1' as AccountId,
      );
    });

    // Change amount after rate is resolved
    await act(async () => {
      result.current.rowActions.setAmount(result.current.rows[0].id, '50');
    });

    const row = result.current.rows[0];
    expect(row.isCrossCurrency).toBe(true);
    expect(row.convertedAmount).toBe(55); // 50 * 1.1
  });

  it('derives a new exchange rate when the converted amount is edited', async () => {
    mockFetchRate.mockResolvedValue(1.1);

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    const rowId = result.current.rows[0].id;
    await act(async () => {
      result.current.rowActions.setAmount(rowId, '100');
      result.current.rowActions.setSourceAccount(rowId, 'acc3' as AccountId);
      result.current.rowActions.setDestinationAccount(rowId, 'acc1' as AccountId);
    });

    act(() => result.current.rowActions.setConvertedAmount(rowId, 150));

    expect(result.current.rows[0]).toMatchObject({
      convertedAmount: 150,
      exchangeRate: '1.500000',
      sourceBaseRate: 1.5,
      destBaseRate: 1,
    });
  });

  it('blocks saving when a cross-currency rate is unavailable', async () => {
    mockFetchRate.mockResolvedValue(null);
    (journalService.saveBulkJournalEntries as jest.Mock).mockResolvedValue({
      success: true,
      summaries: [],
    });

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    await act(async () => {
      result.current.rowActions.setDescription(result.current.rows[0].id, 'Transfer');
      result.current.rowActions.setAmount(result.current.rows[0].id, '100');
      result.current.rowActions.setSourceAccount(result.current.rows[0].id, 'acc3' as AccountId);
      result.current.rowActions.setDestinationAccount(
        result.current.rows[0].id,
        'acc1' as AccountId,
      );
    });

    expect(result.current.rows[0]).toMatchObject({
      isCrossCurrency: true,
      exchangeRate: '',
      rateError: 'Rate unavailable',
    });

    await act(async () => {
      await result.current.saveAll();
    });

    expect(journalService.saveBulkJournalEntries).not.toHaveBeenCalled();
  });

  it('derives a usable cross-rate from a manually entered foreign base rate', async () => {
    mockFetchRate.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    await act(async () => {
      result.current.rowActions.setDescription(result.current.rows[0].id, 'Transfer');
      result.current.rowActions.setAmount(result.current.rows[0].id, '100');
      result.current.rowActions.setSourceAccount(result.current.rows[0].id, 'acc3' as AccountId);
      result.current.rowActions.setDestinationAccount(
        result.current.rows[0].id,
        'acc1' as AccountId,
      );
    });

    act(() => {
      result.current.rowActions.setManualBaseRate(result.current.rows[0].id, 'source', '1.2');
    });

    expect(result.current.rows[0]).toMatchObject({
      exchangeRate: '1.200000',
      sourceBaseRate: 1.2,
      sourceBaseRateInput: '1.2',
      convertedAmount: 120,
      rateError: undefined,
    });
  });

  it('clears a submitted cross-currency validation error after a valid manual rate', async () => {
    mockFetchRate.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    const rowId = result.current.rows[0].id;
    await act(async () => {
      result.current.rowActions.setDescription(rowId, 'Transfer');
      result.current.rowActions.setAmount(rowId, '100');
      result.current.rowActions.setSourceAccount(rowId, 'acc3' as AccountId);
      result.current.rowActions.setDestinationAccount(rowId, 'acc1' as AccountId);
    });

    await act(async () => {
      await result.current.saveAll();
    });

    expect(result.current.rows[0].validationError).toBe(
      'Exchange rate is required for cross-currency',
    );

    act(() => {
      result.current.rowActions.setManualBaseRate(rowId, 'source', '1.2');
    });

    expect(result.current.rows[0]).toMatchObject({
      validationError: undefined,
      rateError: undefined,
      exchangeRate: '1.200000',
      convertedAmount: 120,
    });
  });

  it('clears manual rates before resetting a row to the market rate', async () => {
    mockFetchRate.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    const rowId = result.current.rows[0].id;
    await act(async () => {
      result.current.rowActions.setAmount(rowId, '100');
      result.current.rowActions.setSourceAccount(rowId, 'acc3' as AccountId);
      result.current.rowActions.setDestinationAccount(rowId, 'acc1' as AccountId);
    });
    act(() => result.current.rowActions.setManualBaseRate(rowId, 'source', '1.2'));

    mockFetchRate.mockResolvedValue(1.1);
    await act(async () => {
      result.current.refreshRowRate(rowId);
    });

    expect(result.current.rows[0]).toMatchObject({
      sourceBaseRateInput: '',
      destBaseRateInput: '',
      exchangeRate: '1.100000',
      sourceBaseRate: 1.1,
      destBaseRate: 1,
      convertedAmount: 110,
    });
  });

  it('keeps the typed 1.25 draft without snapping or hiding the input', async () => {
    mockFetchRate.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    await act(async () => {
      result.current.rowActions.setAmount(result.current.rows[0].id, '100');
      result.current.rowActions.setSourceAccount(result.current.rows[0].id, 'acc3' as AccountId);
      result.current.rowActions.setDestinationAccount(
        result.current.rows[0].id,
        'acc1' as AccountId,
      );
    });

    const fetchCountAfterLookup = mockFetchRate.mock.calls.length;

    act(() => {
      result.current.rowActions.setManualBaseRate(result.current.rows[0].id, 'source', '1');
    });
    expect(result.current.rows[0].sourceBaseRateInput).toBe('1');
    expect(result.current.rows[0].exchangeRate).toBe('1.000000');

    act(() => {
      result.current.rowActions.setManualBaseRate(result.current.rows[0].id, 'source', '1.');
    });
    expect(result.current.rows[0].sourceBaseRateInput).toBe('1.');
    expect(result.current.rows[0].exchangeRate).toBe('1.000000');

    act(() => {
      result.current.rowActions.setManualBaseRate(result.current.rows[0].id, 'source', '1.25');
    });
    expect(result.current.rows[0]).toMatchObject({
      sourceBaseRateInput: '1.25',
      sourceBaseRate: 1.25,
      exchangeRate: '1.250000',
      convertedAmount: 125,
      rateError: undefined,
    });
    expect(mockFetchRate).toHaveBeenCalledTimes(fetchCountAfterLookup);
  });

  it('performs row-level validations and prevents saving if any row is invalid', async () => {
    (journalService.saveBulkJournalEntries as jest.Mock).mockResolvedValue({
      success: true,
      summaries: [],
    });

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    expect(result.current.isValid).toBe(false);

    await act(async () => {
      await result.current.saveAll();
    });

    expect(journalService.saveBulkJournalEntries).not.toHaveBeenCalled();
    expect(result.current.rows[0].validationError).toBeDefined();
    expect(result.current.submitError).toBe('Please fix validation errors before saving.');
  });

  it('saves all rows successfully via bulk API and calls onSaveSuccess', async () => {
    (journalService.saveBulkJournalEntries as jest.Mock).mockResolvedValue({
      success: true,
      summaries: [{ description: 'Salary', amount: 500, currency: 'USD' }],
    });

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    act(() => {
      result.current.rowActions.setDescription(result.current.rows[0].id, 'Salary');
      result.current.rowActions.setNotes(result.current.rows[0].id, 'March payroll');
      result.current.rowActions.setAmount(result.current.rows[0].id, '500');
      result.current.rowActions.setSourceAccount(result.current.rows[0].id, 'acc1' as AccountId);
      result.current.rowActions.setDestinationAccount(
        result.current.rows[0].id,
        'acc2' as AccountId,
      );
    });

    expect(result.current.isValid).toBe(true);

    await act(async () => {
      await result.current.saveAll();
    });

    expect(journalService.saveBulkJournalEntries).toHaveBeenCalledTimes(1);
    expect(journalService.saveBulkJournalEntries).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Salary',
          notes: 'March payroll',
        }),
      ]),
    );
    expect(onSaveSuccessMock).toHaveBeenCalledWith(1, [
      { description: 'Salary', amount: 500, currency: 'USD' },
    ]);
    expect(triggerSaveOutcomeHaptic).toHaveBeenCalledWith(true);
  });

  it('coalesces rapid duplicate bulk submissions while the first save is in flight', async () => {
    let resolveSave!: (value: { success: boolean; summaries: never[] }) => void;
    const pendingSave = new Promise<{ success: boolean; summaries: never[] }>(resolve => {
      resolveSave = resolve;
    });
    (journalService.saveBulkJournalEntries as jest.Mock).mockReturnValue(pendingSave);
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );
    act(() => {
      const rowId = result.current.rows[0].id;
      result.current.rowActions.setDescription(rowId, 'Salary');
      result.current.rowActions.setAmount(rowId, '500');
      result.current.rowActions.setSourceAccount(rowId, 'acc1' as AccountId);
      result.current.rowActions.setDestinationAccount(rowId, 'acc2' as AccountId);
    });

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.saveAll();
      second = result.current.saveAll();
    });

    expect(journalService.saveBulkJournalEntries).toHaveBeenCalledTimes(1);
    resolveSave({ success: true, summaries: [] });
    await act(async () => Promise.all([first, second]));
  });

  it('clearRows resets to a single empty row and clears submit error', () => {
    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    // Add a row then clear
    act(() => {
      result.current.addRow();
      result.current.rowActions.setDescription(result.current.rows[0].id, 'Test');
    });

    expect(result.current.rows).toHaveLength(2);

    act(() => {
      result.current.clearRows();
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].description).toBe('');
    expect(result.current.rows[0].amount).toBe('');
    expect(result.current.submitError).toBeNull();
  });

  it('prevents race conditions when fetching exchange rates out of order', async () => {
    let resolveFirstRate!: (val: number) => void;
    let resolveSecondRate!: (val: number) => void;

    const firstRatePromise = new Promise<number>(r => {
      resolveFirstRate = r;
    });
    const secondRatePromise = new Promise<number>(r => {
      resolveSecondRate = r;
    });

    mockFetchRate.mockReturnValueOnce(firstRatePromise).mockReturnValueOnce(secondRatePromise);

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    const rowId = result.current.rows[0].id;

    // 1. Trigger first account change (acc3 is EUR, acc1 is USD)
    await act(async () => {
      result.current.rowActions.setAmount(rowId, '100');
      result.current.rowActions.setSourceAccount(rowId, 'acc3' as AccountId);
      result.current.rowActions.setDestinationAccount(rowId, 'acc1' as AccountId);
    });

    // Verify it is loading
    expect(result.current.rows[0].isLoadingRate).toBe(true);

    // 2. Trigger second account change to a different pair (acc3 EUR to acc2 USD, different rate expected)
    // We clear mock resolved value to use mockReturnValueOnce
    await act(async () => {
      result.current.rowActions.setDestinationAccount(rowId, 'acc2' as AccountId);
    });

    // 3. Resolve the second fetch (the newer one) first
    await act(async () => {
      resolveSecondRate(1.25);
      await secondRatePromise;
    });

    // Row should show the second rate (1.25)
    expect(result.current.rows[0].exchangeRate).toBe('1.250000');
    expect(result.current.rows[0].convertedAmount).toBe(125);
    expect(result.current.rows[0].isLoadingRate).toBe(false);

    // 4. Resolve the first fetch (the stale one)
    await act(async () => {
      resolveFirstRate(1.1);
      await firstRatePromise;
    });

    // Row MUST still show the second rate (1.25), not the stale rate (1.10)
    expect(result.current.rows[0].exchangeRate).toBe('1.250000');
    expect(result.current.rows[0].convertedAmount).toBe(125);
  });

  it('fetches the rate for the row date and refetches when the day changes', async () => {
    const jan1 = Date.parse('2026-01-01T00:00:00.000Z');
    const jan2 = Date.parse('2026-01-02T00:00:00.000Z');
    mockFetchHistoricalRate = jest.fn(async (_from: string, _to: string, timestamp: number) => ({
      rate: timestamp === jan2 ? 1.2 : 1.1,
    }));

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );
    const rowId = result.current.rows[0].id;

    await act(async () => {
      result.current.rowActions.setJournalDate(rowId, new Date(2026, 0, 1, 10).getTime());
      result.current.rowActions.setAmount(rowId, '100');
      result.current.rowActions.setSourceAccount(rowId, 'acc3' as AccountId);
      result.current.rowActions.setDestinationAccount(rowId, 'acc1' as AccountId);
    });

    expect(mockFetchHistoricalRate).toHaveBeenLastCalledWith('EUR', 'USD', jan1);
    expect(mockFetchRate).not.toHaveBeenCalled();
    expect(result.current.rows[0]).toMatchObject({
      exchangeRate: '1.100000',
      convertedAmount: 110,
    });

    act(() => result.current.rowActions.setManualBaseRate(rowId, 'source', '1.3'));
    expect(result.current.rows[0].exchangeRate).toBe('1.300000');

    await act(async () => {
      result.current.rowActions.setJournalDate(rowId, new Date(2026, 0, 2, 10).getTime());
    });

    expect(mockFetchHistoricalRate).toHaveBeenLastCalledWith('EUR', 'USD', jan2);
    expect(result.current.rows[0]).toMatchObject({
      exchangeRate: '1.200000',
      convertedAmount: 120,
      sourceBaseRateInput: '',
    });

    const callsBeforeTimeEdit = mockFetchHistoricalRate.mock.calls.length;
    await act(async () => {
      result.current.rowActions.setJournalDate(rowId, new Date(2026, 0, 2, 18).getTime());
    });
    expect(mockFetchHistoricalRate).toHaveBeenCalledTimes(callsBeforeTimeEdit);
  });

  it('provides loading validation message when exchange rate is loading', async () => {
    let resolveRate!: (val: number) => void;
    const ratePromise = new Promise<number>(r => {
      resolveRate = r;
    });
    mockFetchRate.mockReturnValueOnce(ratePromise);

    const { result } = renderHook(() =>
      useBulkJournalEditor({
        workplaceId: 'wp1' as WorkplaceId,
        workplaceCurrency: 'USD',
        accounts,
        onSaveSuccess: onSaveSuccessMock,
      }),
    );

    const rowId = result.current.rows[0].id;

    await act(async () => {
      result.current.rowActions.setAmount(rowId, '100');
      result.current.rowActions.setDescription(rowId, 'Coffee');
      result.current.rowActions.setSourceAccount(rowId, 'acc3' as AccountId);
      result.current.rowActions.setDestinationAccount(rowId, 'acc1' as AccountId);
    });

    expect(result.current.rows[0].isLoadingRate).toBe(true);

    // Trigger save to force validation check
    await act(async () => {
      await result.current.saveAll();
    });

    expect(result.current.rows[0].validationError).toBe('Exchange rate is loading...');

    // Resolve rate
    await act(async () => {
      resolveRate(1.1);
      await ratePromise;
    });

    // Validate that it succeeded
    expect(result.current.rows[0].validationError).toBeUndefined();
  });
});
