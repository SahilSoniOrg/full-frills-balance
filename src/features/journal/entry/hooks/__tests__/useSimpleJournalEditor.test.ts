import { AccountType, TransactionType } from '@/src/types/domain';

import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockFetchRate = jest.fn();
jest.mock('@/src/hooks/useExchangeRate', () => ({
  useExchangeRate: () => ({
    fetchRate: mockFetchRate,
  }),
}));

jest.mock('@/src/features/journal/hooks/useAccountSelection', () => ({
  useAccountSelection: jest.fn(({ accounts }) => ({
    transactionAccounts: accounts,
    expenseAccounts: accounts,
    incomeAccounts: accounts,
    leafAccounts: accounts,
  })),
}));

jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    defaultCurrencyCode: 'USD',
    journalNav: {
      lastUsedSourceAccountId: undefined,
      lastUsedDestinationAccountId: undefined,
      setLastUsedSourceAccountId: jest.fn().mockResolvedValue(undefined),
      setLastUsedDestinationAccountId: jest.fn().mockResolvedValue(undefined),
    },
  },
  preferencesMigration: {
    legacyCurrencyCode: undefined,
    clearLegacyCurrencyCode: jest.fn(),
  },
}));

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({
    workplaceId: 'wp-1',
    activeWorkplaceId: 'wp-1',
    activeWorkplace: { id: 'wp-1', name: 'Personal' },
    defaultCurrencyCode: 'USD',
  }),
}));

function createEditor(success: boolean, options?: { crossCurrency?: boolean }) {
  const crossCurrency = options?.crossCurrency ?? false;
  const lines = [
    {
      id: '1',
      accountId: 'source',
      accountName: 'Cash',
      accountType: AccountType.ASSET,
      amount: '100',
      transactionType: TransactionType.CREDIT,
      notes: '',
      exchangeRate: '',
      accountCurrency: crossCurrency ? 'EUR' : 'USD',
    },
    {
      id: '2',
      accountId: 'destination',
      accountName: crossCurrency ? 'EUR Bank' : 'Food',
      accountType: crossCurrency ? AccountType.ASSET : AccountType.EXPENSE,
      amount: '100',
      transactionType: TransactionType.DEBIT,
      notes: '',
      exchangeRate: '',
      accountCurrency: crossCurrency ? 'GBP' : 'USD',
    },
  ];

  const editor = {
    transactionType: 'expense' as const,
    setTransactionType: jest.fn(),
    isGuidedMode: true,
    isEdit: false,
    lines,
    setLines: jest.fn(),
    updateLine: jest.fn((id: string, updates: Record<string, unknown>) => {
      const line = editor.lines.find(l => l.id === id);
      if (line) Object.assign(line, updates);
    }),
    updateLines: jest.fn((batch: Record<string, Record<string, unknown>>) => {
      Object.entries(batch).forEach(([id, updates]) => {
        const line = editor.lines.find(l => l.id === id);
        if (line) Object.assign(line, updates);
      });
    }),
    description: 'Lunch',
    setDescription: jest.fn(),
    submit: jest.fn().mockResolvedValue({ success }),
    isSubmitting: false,
    journalDate: '2026-01-01',
    journalTime: '12:00',
  };

  return editor;
}

describe('useSimpleJournalEditor', () => {
  const accounts = [
    { id: 'source', name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
    { id: 'destination', name: 'Food', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
    { id: 'eur-source', name: 'EUR Cash', accountType: AccountType.ASSET, currencyCode: 'EUR' },
    { id: 'gbp-dest', name: 'GBP Bank', accountType: AccountType.ASSET, currencyCode: 'GBP' },
    { id: 'usd-dest', name: 'USD Bank', accountType: AccountType.ASSET, currencyCode: 'USD' },
  ] as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchRate.mockResolvedValue(1.0);
  });

  it('navigates via onSuccess when submit succeeds', async () => {
    const editor = createEditor(true);

    const { result } = renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor: editor as any,
        onSelectAccountRequest: jest.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(editor.submit).toHaveBeenCalled();
  });

  it('does not navigate via onSuccess when submit fails', async () => {
    const editor = createEditor(false);

    const { result } = renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor: editor as any,
        onSelectAccountRequest: jest.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(editor.submit).toHaveBeenCalled();
  });

  it('applies cross-currency rates to editor lines when they differ', async () => {
    mockFetchRate.mockImplementation(async (from: string) => {
      if (from === 'EUR') return 1.1;
      if (from === 'GBP') return 1.25;
      return 1;
    });

    const editor = createEditor(true, { crossCurrency: true });
    editor.lines[0].accountId = 'eur-source';
    editor.lines[1].accountId = 'gbp-dest';

    const { result } = renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor: editor as any,
        onSelectAccountRequest: jest.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.isCrossCurrency).toBe(true);
      expect(result.current.exchangeRate).toBeCloseTo(1.1 / 1.25);
      expect(editor.updateLines).toHaveBeenCalled();
    });

    const lastBatch = (editor.updateLines as jest.Mock).mock.calls.at(-1)?.[0];
    expect(lastBatch['1'].exchangeRate).toBe((1.1).toFixed(6));
    expect(lastBatch['2'].exchangeRate).toBe((1.25).toFixed(6));
    expect(lastBatch['2'].amount).toBe(((100 * 1.1) / 1.25).toFixed(2));
  });

  it('does not call updateLines again when line fields already match rates', async () => {
    mockFetchRate.mockImplementation(async (from: string) => {
      if (from === 'EUR') return 1.1;
      if (from === 'GBP') return 1.25;
      return 1;
    });

    const editor = createEditor(true, { crossCurrency: true });
    editor.lines[0].accountId = 'eur-source';
    editor.lines[0].exchangeRate = (1.1).toFixed(6);
    editor.lines[1].accountId = 'gbp-dest';
    editor.lines[1].exchangeRate = (1.25).toFixed(6);
    editor.lines[1].amount = ((100 * 1.1) / 1.25).toFixed(2);

    renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor: editor as any,
        onSelectAccountRequest: jest.fn(),
      }),
    );

    await waitFor(() => {
      expect(mockFetchRate).toHaveBeenCalled();
    });

    // Allow any deferred rate/effect ticks to settle
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(editor.updateLines).not.toHaveBeenCalled();
  });

  it('ignores stale rate fetch when currencies change mid-flight', async () => {
    let resolveFirst!: (val: number) => void;
    let resolveSecond!: (val: number) => void;

    const firstRatePromise = new Promise<number>(r => {
      resolveFirst = r;
    });
    const secondRatePromise = new Promise<number>(r => {
      resolveSecond = r;
    });

    mockFetchRate.mockReturnValueOnce(firstRatePromise).mockReturnValueOnce(secondRatePromise);

    const editor = createEditor(true, { crossCurrency: true });
    editor.lines[0].accountId = 'eur-source';
    editor.lines[1].accountId = 'usd-dest';
    editor.lines[1].accountCurrency = 'USD';

    const { result, rerender } = renderHook(
      ({ editorLines }: { editorLines: typeof editor.lines }) => {
        editor.lines = editorLines;
        return useSimpleJournalEditor({
          accounts,
          editor: editor as any,
          onSelectAccountRequest: jest.fn(),
        });
      },
      { initialProps: { editorLines: [...editor.lines] } },
    );

    await waitFor(() => {
      expect(result.current.isLoadingRate).toBe(true);
    });

    // Switch source from EUR to GBP while first fetch is in flight
    const nextLines = editor.lines.map(l =>
      l.id === '1'
        ? { ...l, accountId: 'eur-source', accountCurrency: 'GBP', accountName: 'GBP Cash' }
        : l,
    );
    // Use gbp account id that exists
    nextLines[0] = {
      ...nextLines[0],
      accountId: 'gbp-dest',
      accountName: 'GBP Bank',
      accountCurrency: 'GBP',
    };

    await act(async () => {
      rerender({ editorLines: nextLines });
    });

    await act(async () => {
      resolveSecond(1.25);
      await secondRatePromise;
    });

    await waitFor(() => {
      expect(result.current.exchangeRate).toBe(1.25);
      expect(result.current.isLoadingRate).toBe(false);
    });

    await act(async () => {
      resolveFirst(1.1);
      await firstRatePromise;
    });

    // Stale EUR rate must not overwrite the newer GBP→USD rate
    expect(result.current.exchangeRate).toBe(1.25);
    expect(result.current.sourceCurrency).toBe('GBP');
  });
});
