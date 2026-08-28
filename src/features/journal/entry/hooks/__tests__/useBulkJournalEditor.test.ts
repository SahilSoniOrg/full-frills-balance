import { AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

import { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import { journalService } from '@/src/services/journal/journalDomainService';
import { act, renderHook } from '@testing-library/react-native';

const mockFetchRate = jest.fn();
jest.mock('@/src/hooks/useExchangeRate', () => ({
  useExchangeRate: () => ({
    fetchRate: mockFetchRate,
  }),
}));

jest.mock('@/src/services/journal/journalDomainService', () => ({
  journalService: {
    saveBulkJournalEntries: jest.fn(),
  },
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
      result.current.updateRowField(result.current.rows[0].id, 'description', 'Lunch');
      result.current.updateRowField(result.current.rows[0].id, 'notes', 'Office cafeteria');
      result.current.updateRowField(result.current.rows[0].id, 'amount', '15.50');
      result.current.updateRowField(result.current.rows[0].id, 'sourceId', 'acc1');
      result.current.updateRowField(result.current.rows[0].id, 'destinationId', 'acc2');
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
      result.current.updateRowField(result.current.rows[0].id, 'amount', '100');
      result.current.updateRowField(result.current.rows[0].id, 'sourceId', 'acc3');
      result.current.updateRowField(result.current.rows[0].id, 'destinationId', 'acc1');
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
      result.current.updateRowField(result.current.rows[0].id, 'sourceId', 'acc3');
      result.current.updateRowField(result.current.rows[0].id, 'destinationId', 'acc1');
    });

    // Change amount after rate is resolved
    await act(async () => {
      result.current.updateRowField(result.current.rows[0].id, 'amount', '50');
    });

    const row = result.current.rows[0];
    expect(row.isCrossCurrency).toBe(true);
    expect(row.convertedAmount).toBe(55); // 50 * 1.1
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
    expect(result.current.rows[0].error).toBeDefined();
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
      result.current.updateRowField(result.current.rows[0].id, 'description', 'Salary');
      result.current.updateRowField(result.current.rows[0].id, 'notes', 'March payroll');
      result.current.updateRowField(result.current.rows[0].id, 'amount', '500');
      result.current.updateRowField(result.current.rows[0].id, 'sourceId', 'acc1');
      result.current.updateRowField(result.current.rows[0].id, 'destinationId', 'acc2');
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
      result.current.updateRowField(result.current.rows[0].id, 'description', 'Test');
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
      result.current.updateRowField(rowId, 'amount', '100');
      result.current.updateRowField(rowId, 'sourceId', 'acc3');
      result.current.updateRowField(rowId, 'destinationId', 'acc1');
    });

    // Verify it is loading
    expect(result.current.rows[0].isLoadingRate).toBe(true);

    // 2. Trigger second account change to a different pair (acc3 EUR to acc2 USD, different rate expected)
    // We clear mock resolved value to use mockReturnValueOnce
    await act(async () => {
      result.current.updateRowField(rowId, 'destinationId', 'acc2');
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
      result.current.updateRowField(rowId, 'amount', '100');
      result.current.updateRowField(rowId, 'description', 'Coffee');
      result.current.updateRowField(rowId, 'sourceId', 'acc3');
      result.current.updateRowField(rowId, 'destinationId', 'acc1');
    });

    expect(result.current.rows[0].isLoadingRate).toBe(true);

    // Trigger save to force validation check
    await act(async () => {
      await result.current.saveAll();
    });

    expect(result.current.rows[0].error).toBe('Exchange rate is loading...');

    // Resolve rate
    await act(async () => {
      resolveRate(1.1);
      await ratePromise;
    });

    // Validate that it succeeded
    expect(result.current.rows[0].error).toBeUndefined();
  });
});
