import { AccountType, TransactionType } from '@/src/types/enums';
import { asAccountId, asTransactionId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import type { JournalEntryLine } from '@/src/types/domainJournal';
import {
  type UseSimpleJournalEditorProps,
  useSimpleJournalEditor,
} from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCallback, useState } from 'react';

const mockFetchRate = jest.fn();
const mockFetchHistoricalRate = jest.fn();
jest.mock('@/src/hooks/useExchangeRate', () => ({
  useExchangeRate: () => ({
    fetchRate: mockFetchRate,
    fetchRequiredRate: mockFetchRate,
    fetchHistoricalRate: mockFetchHistoricalRate,
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

jest.mock('@/src/services/preferences', () => ({
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
    defaultCurrencyCode: mockWorkplaceCurrency,
  }),
}));

let mockWorkplaceCurrency = 'USD';

function createEditor(options?: {
  crossCurrency?: boolean;
  type?: 'expense' | 'income' | 'transfer';
  isEdit?: boolean;
  valuationCurrency?: string;
}) {
  type EditorContract = UseSimpleJournalEditorProps['editor'];
  type Editor = Omit<EditorContract, 'updateLine' | 'updateLines'> & {
    updateLine: jest.MockedFunction<EditorContract['updateLine']>;
    updateLines: jest.MockedFunction<EditorContract['updateLines']>;
  };
  const crossCurrency = options?.crossCurrency ?? false;
  const transactionType = options?.type ?? 'expense';
  const lines: Editor['lines'] = [
    {
      id: asTransactionId('1'),
      accountId: asAccountId('source'),
      accountName: 'Cash',
      accountType: AccountType.ASSET,
      amount: '100',
      transactionType: TransactionType.CREDIT,
      notes: '',
      exchangeRate: '',
      accountCurrency: crossCurrency ? 'EUR' : 'USD',
    },
    {
      id: asTransactionId('2'),
      accountId: asAccountId('destination'),
      accountName: crossCurrency ? 'EUR Bank' : 'Food',
      accountType: crossCurrency ? AccountType.ASSET : AccountType.EXPENSE,
      amount: '100',
      transactionType: TransactionType.DEBIT,
      notes: '',
      exchangeRate: '',
      accountCurrency: crossCurrency ? 'GBP' : 'USD',
    },
  ];

  const editor: Editor = {
    transactionType,
    setTransactionType: jest.fn(),
    isGuidedMode: true,
    isEdit: options?.isEdit ?? false,
    valuationCurrency: options?.valuationCurrency ?? mockWorkplaceCurrency,
    lines,
    setLines: jest.fn(),
    updateLine: jest.fn((id: string, updates: Partial<JournalEntryLine>) => {
      const line = editor.lines.find(l => l.id === id);
      if (line) Object.assign(line, updates);
    }),
    updateLines: jest.fn((batch: Record<string, Partial<JournalEntryLine>>) => {
      Object.entries(batch).forEach(([id, updates]) => {
        const line = editor.lines.find(l => l.id === id);
        if (line) Object.assign(line, updates);
      });
    }),
    description: 'Lunch',
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
    {
      id: 'inr-dest',
      name: 'Subscriptions',
      accountType: AccountType.EXPENSE,
      currencyCode: 'INR',
    },
  ] as AccountFields[];

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkplaceCurrency = 'USD';
    mockFetchRate.mockResolvedValue(1.0);
    mockFetchHistoricalRate.mockReset();
    mockFetchHistoricalRate.mockImplementation(async (from: string, to: string) => ({
      rate: await mockFetchRate(from, to),
    }));
  });

  it('applies cross-currency rates to editor lines when they differ', async () => {
    mockFetchRate.mockImplementation(async (from: string) => {
      if (from === 'EUR') return 1.1;
      if (from === 'GBP') return 1.25;
      return 1;
    });

    const editor = createEditor({ crossCurrency: true });
    editor.lines[0].accountId = asAccountId('eur-source');
    editor.lines[1].accountId = asAccountId('gbp-dest');

    const { result } = renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor,
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

  it('uses saved journal rates on edit without fetching or rewriting lines on open', async () => {
    mockWorkplaceCurrency = 'INR';
    const editor = createEditor({ crossCurrency: true, isEdit: true, valuationCurrency: 'USD' });
    editor.lines[0].accountId = asAccountId('eur-source');
    editor.lines[0].accountCurrency = 'EUR';
    editor.lines[0].amount = '100';
    editor.lines[0].exchangeRate = '1.1';
    editor.lines[1].accountId = asAccountId('usd-dest');
    editor.lines[1].accountCurrency = 'USD';
    editor.lines[1].amount = '110';
    editor.lines[1].exchangeRate = '';

    const { result } = renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor,
        onSelectAccountRequest: jest.fn(),
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.exchangeRate).toBeCloseTo(1.1);
    expect(result.current.convertedAmount).toBeCloseTo(110);
    expect(mockFetchHistoricalRate).not.toHaveBeenCalled();
    expect(mockFetchRate).not.toHaveBeenCalled();
    expect(editor.updateLines).not.toHaveBeenCalled();
  });

  it('locks the saved rate from an edited converted amount and skips further API fetches', async () => {
    mockWorkplaceCurrency = 'INR';
    mockFetchRate.mockResolvedValue(95.9546);

    const editor = createEditor();
    editor.lines[0].amount = '50';
    editor.lines[1].amount = '50';
    editor.lines[1].accountId = asAccountId('inr-dest');
    editor.lines[1].accountName = 'Subscriptions';
    editor.lines[1].accountCurrency = 'INR';

    const { result } = renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor,
        onSelectAccountRequest: jest.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.isCrossCurrency).toBe(true);
      expect(result.current.exchangeRate).toBeCloseTo(95.9546);
    });
    const fetchCount = mockFetchRate.mock.calls.length;

    act(() => result.current.setConvertedAmount('4800'));

    await waitFor(() => {
      expect(result.current.exchangeRate).toBeCloseTo(96);
      expect(result.current.convertedAmount).toBeCloseTo(4800);
    });
    expect(mockFetchRate).toHaveBeenCalledTimes(fetchCount);

    const lastBatch = (editor.updateLines as jest.Mock).mock.calls.at(-1)?.[0];
    expect(lastBatch['1'].exchangeRate).toBe((96).toFixed(6));
    expect(lastBatch['2'].amount).toBe('4800.00');

    act(() => result.current.resetToApiRate());

    await waitFor(() => {
      expect(result.current.exchangeRate).toBeCloseTo(95.9546);
    });
    expect(mockFetchRate.mock.calls.length).toBeGreaterThan(fetchCount);
  });

  it('refetches the market rate when the journal date changes after a converted-amount lock', async () => {
    mockWorkplaceCurrency = 'INR';
    mockFetchRate.mockResolvedValue(95.9546);

    const editor = createEditor();
    editor.lines[0].amount = '50';
    editor.lines[1].amount = '50';
    editor.lines[1].accountId = asAccountId('inr-dest');
    editor.lines[1].accountName = 'Subscriptions';
    editor.lines[1].accountCurrency = 'INR';

    const { result, rerender } = renderHook(
      ({ journalDate }: { journalDate: string }) => {
        editor.journalDate = journalDate;
        return useSimpleJournalEditor({
          accounts,
          editor,
          onSelectAccountRequest: jest.fn(),
        });
      },
      { initialProps: { journalDate: '2026-01-01' } },
    );

    await waitFor(() => {
      expect(result.current.exchangeRate).toBeCloseTo(95.9546);
    });

    act(() => result.current.setConvertedAmount('4800'));
    await waitFor(() => {
      expect(result.current.exchangeRate).toBeCloseTo(96);
    });

    mockFetchRate.mockResolvedValue(90);
    await act(async () => {
      rerender({ journalDate: '2026-01-02' });
    });

    await waitFor(() => {
      expect(result.current.exchangeRate).toBeCloseTo(90);
    });
    expect(mockFetchHistoricalRate).toHaveBeenCalledWith(
      'USD',
      'INR',
      Date.parse('2026-01-02T00:00:00.000Z'),
    );
  });

  it('applies one historical workplace rate to equal foreign currencies', async () => {
    mockWorkplaceCurrency = 'INR';
    mockFetchHistoricalRate.mockResolvedValue({ rate: 95.51 });

    const editor = createEditor();
    editor.journalDate = '2024-10-03';

    const { result } = renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor,
        onSelectAccountRequest: jest.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.isCrossCurrency).toBe(false);
      expect(editor.updateLines).toHaveBeenCalled();
    });

    const lastBatch = (editor.updateLines as jest.Mock).mock.calls.at(-1)?.[0];
    expect(lastBatch['1'].exchangeRate).toBe('95.510000');
    expect(lastBatch['2'].exchangeRate).toBe('95.510000');
    expect(lastBatch['2'].amount).toBeUndefined();
    expect(mockFetchHistoricalRate).toHaveBeenCalledWith(
      'USD',
      'INR',
      Date.parse('2024-10-03T00:00:00.000Z'),
    );
  });

  it('does not call updateLines again when line fields already match rates', async () => {
    mockFetchRate.mockImplementation(async (from: string) => {
      if (from === 'EUR') return 1.1;
      if (from === 'GBP') return 1.25;
      return 1;
    });

    const editor = createEditor({ crossCurrency: true });
    editor.lines[0].accountId = asAccountId('eur-source');
    editor.lines[0].exchangeRate = (1.1).toFixed(6);
    editor.lines[1].accountId = asAccountId('gbp-dest');
    editor.lines[1].exchangeRate = (1.25).toFixed(6);
    editor.lines[1].amount = ((100 * 1.1) / 1.25).toFixed(2);

    renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor,
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

    const editor = createEditor({ crossCurrency: true });
    editor.lines[0].accountId = asAccountId('eur-source');
    editor.lines[1].accountId = asAccountId('usd-dest');
    editor.lines[1].accountCurrency = 'USD';

    const { result, rerender } = renderHook(
      ({ editorLines }: { editorLines: typeof editor.lines }) => {
        editor.lines = editorLines;
        return useSimpleJournalEditor({
          accounts,
          editor,
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
        ? {
            ...l,
            accountId: asAccountId('eur-source'),
            accountCurrency: 'GBP',
            accountName: 'GBP Cash',
          }
        : l,
    );
    // Use gbp account id that exists
    nextLines[0] = {
      ...nextLines[0],
      accountId: asAccountId('gbp-dest'),
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

  it('restores the complete expense draft after visiting another transaction tab', async () => {
    function useHarness() {
      const [transactionType, setTransactionType] = useState<'expense' | 'income' | 'transfer'>(
        'expense',
      );
      const [lines, setLines] = useState(createEditor().lines);
      const updateLine = useCallback((id: string, updates: Partial<JournalEntryLine>) => {
        setLines(current => current.map(line => (line.id === id ? { ...line, ...updates } : line)));
      }, []);
      const updateLines = useCallback((updates: Record<string, Partial<JournalEntryLine>>) => {
        setLines(current =>
          current.map(line => (updates[line.id] ? { ...line, ...updates[line.id] } : line)),
        );
      }, []);
      const editor = {
        ...createEditor(),
        transactionType,
        setTransactionType,
        isEdit: true,
        lines,
        setLines,
        updateLine,
        updateLines,
      };
      const simple = useSimpleJournalEditor({
        accounts,
        editor,
        onSelectAccountRequest: jest.fn(),
      });
      return { simple, lines };
    }

    const { result } = renderHook(useHarness);
    const original = result.current.lines.map(line => ({ ...line }));

    act(() => result.current.simple.setType('income'));
    await waitFor(() => expect(result.current.simple.type).toBe('income'));
    act(() => result.current.simple.setType('expense'));
    await waitFor(() => expect(result.current.simple.type).toBe('expense'));

    expect(result.current.lines).toEqual(original);
  });

  it('keeps typed 1.25 in the manual field without snapping or hiding it', async () => {
    mockFetchHistoricalRate.mockRejectedValue(new Error('unavailable'));
    mockFetchRate.mockResolvedValue(null);

    const editor = createEditor({ crossCurrency: true });
    editor.lines[0].accountId = asAccountId('eur-source');
    editor.lines[1].accountId = asAccountId('usd-dest');
    editor.lines[1].accountName = 'USD Bank';
    editor.lines[1].accountCurrency = 'USD';

    const { result } = renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor,
        onSelectAccountRequest: jest.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.rateError).toBe('Rate unavailable');
      expect(result.current.showManualRateFields).toBe(true);
    });
    const historicalCalls = mockFetchHistoricalRate.mock.calls.length;

    act(() => result.current.setManualBaseRate('source', '1'));
    expect(result.current.manualSourceBaseRate).toBe('1');
    expect(result.current.showManualRateFields).toBe(true);

    act(() => result.current.setManualBaseRate('source', '1.'));
    expect(result.current.manualSourceBaseRate).toBe('1.');
    expect(result.current.showManualRateFields).toBe(true);

    act(() => result.current.setManualBaseRate('source', '1.25'));
    await waitFor(() => {
      expect(result.current.exchangeRate).toBe(1.25);
    });
    expect(result.current.manualSourceBaseRate).toBe('1.25');
    expect(result.current.showManualRateFields).toBe(true);
    expect(mockFetchHistoricalRate).toHaveBeenCalledTimes(historicalCalls);
  });

  it('allows unselecting accounts to EMPTY_ACCOUNT_ID and keeps them unselected', async () => {
    const editor = createEditor();
    editor.lines[0].accountId = asAccountId('source');
    editor.lines[1].accountId = asAccountId('destination');

    const { result } = renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor,
        onSelectAccountRequest: jest.fn(),
      }),
    );

    const sourceSection = result.current.accountSections.find(s => s.role === 'source');
    expect(sourceSection).toBeDefined();

    // Unselect source account
    act(() => {
      sourceSection!.onSelect(EMPTY_ACCOUNT_ID);
    });

    expect(editor.lines[0].accountId).toBe(EMPTY_ACCOUNT_ID);
    expect(editor.lines[0].accountName).toBe('');

    const destSection = result.current.accountSections.find(s => s.role === 'destination');
    expect(destSection).toBeDefined();

    // Unselect destination account
    act(() => {
      destSection!.onSelect(EMPTY_ACCOUNT_ID);
    });

    expect(editor.lines[1].accountId).toBe(EMPTY_ACCOUNT_ID);
    expect(editor.lines[1].accountName).toBe('');
  });

  it('swaps source and destination accounts for transfers', () => {
    const editor = createEditor({ type: 'transfer' });
    const { result } = renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor,
        onSelectAccountRequest: jest.fn(),
      }),
    );
    editor.updateLine.mockClear();
    editor.updateLines.mockClear();

    act(() => {
      result.current.setManualBaseRate('source', '1.1');
      result.current.setManualBaseRate('destination', '1.25');
    });

    act(() => result.current.swapAccounts());

    expect(editor.lines[0].accountId).toBe('destination');
    expect(editor.lines[1].accountId).toBe('source');
    expect(editor.updateLine).not.toHaveBeenCalled();
    expect(editor.updateLines).toHaveBeenCalledTimes(1);
    expect(editor.updateLines).toHaveBeenCalledWith({
      '1': {
        accountId: 'destination',
        accountName: 'Food',
        accountType: AccountType.EXPENSE,
        accountCurrency: 'USD',
      },
      '2': {
        accountId: 'source',
        accountName: 'Cash',
        accountType: AccountType.ASSET,
        accountCurrency: 'USD',
      },
    });
    expect(result.current.manualSourceBaseRate).toBe('');
    expect(result.current.manualDestBaseRate).toBe('');
  });

  it('does not swap when either transfer line is missing', () => {
    const editor = createEditor({ type: 'transfer' });
    editor.lines = editor.lines.filter(line => line.transactionType === TransactionType.CREDIT);

    const { result } = renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor,
        onSelectAccountRequest: jest.fn(),
      }),
    );
    editor.updateLines.mockClear();

    act(() => result.current.swapAccounts());

    expect(editor.updateLines).not.toHaveBeenCalled();
    expect(editor.lines[0].accountId).toBe('source');
  });

  it('does not swap accounts for non-transfer entries', () => {
    const editor = createEditor({ type: 'expense' });
    const { result } = renderHook(() =>
      useSimpleJournalEditor({
        accounts,
        editor,
        onSelectAccountRequest: jest.fn(),
      }),
    );
    editor.updateLine.mockClear();
    editor.updateLines.mockClear();

    act(() => result.current.swapAccounts());

    expect(editor.lines[0].accountId).toBe('source');
    expect(editor.lines[1].accountId).toBe('destination');
    expect(editor.updateLine).not.toHaveBeenCalled();
    expect(editor.updateLines).not.toHaveBeenCalled();
  });
});
