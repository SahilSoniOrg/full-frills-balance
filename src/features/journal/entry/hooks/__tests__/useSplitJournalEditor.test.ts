import { renderHook, act } from '@testing-library/react-native';
import { useCallback, useMemo, useState } from 'react';
import { AccountType, TransactionType } from '@/src/types/enums';
import { asAccountId, asTransactionId, type AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import type { FxFetchedRates } from '@/src/features/journal/entry/fxPair';
import { type UseSplitJournalEditorProps, useSplitJournalEditor } from '../useSplitJournalEditor';
import type { JournalEntryLine } from '@/src/types/domainJournal';

jest.mock('@/src/features/journal/entry/hooks/useCrossCurrencyRates', () => ({
  currencyPairKey: (source?: string, dest?: string) => `${source ?? ''}>${dest ?? ''}`,
  useCrossCurrencyRatesMap: jest.fn(() => ({})),
}));

const mockUseCrossCurrencyRatesMap = jest.requireMock(
  '@/src/features/journal/entry/hooks/useCrossCurrencyRates',
).useCrossCurrencyRatesMap as jest.Mock;

beforeEach(() => {
  mockUseCrossCurrencyRatesMap.mockReset();
  mockUseCrossCurrencyRatesMap.mockReturnValue({});
});

jest.mock('@/src/features/journal/hooks/useAccountSelection', () => ({
  useAccountSelection: jest.fn(({ accounts }) => ({
    leafAccounts: accounts,
    transactionAccounts: accounts.filter(
      (account: AccountFields) =>
        account.accountType !== 'EXPENSE' && account.accountType !== 'INCOME',
    ),
    expenseAccounts: accounts.filter((account: AccountFields) => account.accountType === 'EXPENSE'),
    incomeAccounts: accounts.filter((account: AccountFields) => account.accountType === 'INCOME'),
  })),
}));

jest.mock('@/src/services/preferences', () => ({
  preferences: {
    journalNav: { lastUsedSourceAccountId: undefined },
  },
}));

jest.mock('@/src/hooks/use-currencies', () => ({
  useCurrencies: () => ({ currencies: [], isLoading: false }),
}));

function createEditor(sourceAccountId = 'cash') {
  type Editor = UseSplitJournalEditorProps['editor'];
  const lines: Editor['lines'] = [
    {
      id: asTransactionId('source'),
      accountId: asAccountId(sourceAccountId),
      accountName: 'Cash',
      accountType: AccountType.ASSET,
      accountCurrency: 'USD',
      amount: '50',
      transactionType: TransactionType.CREDIT,
      notes: '',
      exchangeRate: '',
    },
    {
      id: asTransactionId('split-1'),
      accountId: asAccountId('groceries'),
      accountName: 'Groceries',
      accountType: AccountType.EXPENSE,
      accountCurrency: 'USD',
      amount: '25',
      transactionType: TransactionType.DEBIT,
      notes: '',
      exchangeRate: '',
    },
    {
      id: asTransactionId('split-2'),
      accountId: asAccountId('bills'),
      accountName: 'Bills',
      accountType: AccountType.EXPENSE,
      accountCurrency: 'USD',
      amount: '25',
      transactionType: TransactionType.DEBIT,
      notes: '',
      exchangeRate: '',
    },
  ];

  const editor: Editor = {
    transactionType: 'expense',
    setTransactionType: jest.fn(),
    lines,
    isEdit: false,
    isSubmitting: false,
    journalDate: '2026-01-01',
    updateLine: jest.fn((id: string, patch: Partial<JournalEntryLine>) => {
      const line = lines.find(candidate => candidate.id === id);
      if (line) Object.assign(line, patch);
    }),
    updateLines: jest.fn((updates: Record<string, Partial<JournalEntryLine>>) => {
      lines.forEach(line => {
        if (updates[line.id]) Object.assign(line, updates[line.id]);
      });
    }),
    setLines: jest.fn((nextLines: Parameters<Editor['setLines']>[0]) => {
      const next = typeof nextLines === 'function' ? nextLines(lines) : nextLines;
      lines.splice(0, lines.length, ...next);
    }),
    addLine: jest.fn(),
    setIsGuidedMode: jest.fn(),
  };
  return editor;
}

describe('useSplitJournalEditor', () => {
  it('refreshes line metadata when a split category changes', () => {
    const editor = createEditor();
    const accounts = [
      { id: 'cash', name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
      { id: 'groceries', name: 'Groceries', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
      { id: 'foreign', name: 'Travel EUR', accountType: AccountType.EXPENSE, currencyCode: 'EUR' },
    ];

    const { result } = renderHook(() =>
      useSplitJournalEditor({
        accounts: accounts as AccountFields[],
        workplaceCurrency: 'USD',
        editor,
      }),
    );

    act(() => {
      result.current.updateSplitRow('split-1', { accountId: 'foreign' as AccountId });
    });

    expect(editor.updateLine).toHaveBeenCalledWith('split-1', {
      accountId: 'foreign',
      accountName: 'Travel EUR',
      accountType: AccountType.EXPENSE,
      accountCurrency: 'EUR',
      exchangeRate: '',
    });
  });

  it('uses the workplace currency until a source account is selected', () => {
    const editor = createEditor('');
    const accounts = [
      { id: 'foreign', name: 'Euro Cash', accountType: AccountType.ASSET, currencyCode: 'EUR' },
    ];

    const { result } = renderHook(() =>
      useSplitJournalEditor({
        accounts: accounts as AccountFields[],
        workplaceCurrency: 'INR',
        editor,
      }),
    );

    expect(result.current.displayCurrency).toBe('INR');
  });

  it('updates split amounts in one editor batch', () => {
    const editor = createEditor();
    const accounts = [
      { id: 'cash', name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
      { id: 'groceries', name: 'Groceries', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
      { id: 'bills', name: 'Bills', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
    ];

    const { result } = renderHook(() =>
      useSplitJournalEditor({
        accounts: accounts as AccountFields[],
        workplaceCurrency: 'USD',
        editor,
      }),
    );

    act(() => {
      result.current.updateSplitAmounts({ 'split-1': '20.00', 'split-2': '30.00' });
    });

    expect(editor.updateLines).toHaveBeenCalledTimes(1);
    expect(editor.updateLines).toHaveBeenCalledWith({
      'split-1': { amount: '20.00' },
      'split-2': { amount: '30.00' },
    });
    expect(editor.lines.map(line => line.amount)).toEqual(['50', '20.00', '30.00']);
  });

  it('retains one allocation row when removing split rows', () => {
    const editor = createEditor();
    const accounts = [
      { id: 'cash', name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
      { id: 'groceries', name: 'Groceries', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
      { id: 'bills', name: 'Bills', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
    ];

    const { result } = renderHook(() =>
      useSplitJournalEditor({
        accounts: accounts as AccountFields[],
        workplaceCurrency: 'USD',
        editor,
      }),
    );

    act(() => {
      result.current.removeSplitRow('split-1');
      result.current.removeSplitRow('split-2');
    });

    expect(editor.lines).toHaveLength(2);
    expect(editor.lines.map(line => line.id)).toEqual(['source', 'split-2']);
  });

  it.each([
    ['expense', ['cash'], ['groceries', 'bills']],
    ['income', ['salary'], ['cash']],
    [
      'transfer',
      ['cash', 'salary', 'groceries', 'bills'],
      ['cash', 'salary', 'groceries', 'bills'],
    ],
  ] as const)(
    'derives source and allocation account roles for %s',
    (type, sourceIds, allocationIds) => {
      const editor = createEditor();
      editor.transactionType = type;
      const accounts = [
        { id: 'cash', name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
        { id: 'salary', name: 'Salary', accountType: AccountType.INCOME, currencyCode: 'USD' },
        {
          id: 'groceries',
          name: 'Groceries',
          accountType: AccountType.EXPENSE,
          currencyCode: 'USD',
        },
        { id: 'bills', name: 'Bills', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
      ];

      const { result } = renderHook(() =>
        useSplitJournalEditor({
          accounts: accounts as AccountFields[],
          workplaceCurrency: 'USD',
          editor,
        }),
      );

      expect(result.current.sourceAccounts.map(account => account.id)).toEqual(sourceIds);
      expect(result.current.allocationAccounts.map(account => account.id)).toEqual(allocationIds);
    },
  );

  it('uses the shared editor type setter and clears selections that no longer fit the new roles', () => {
    const editor = createEditor();
    const accounts = [
      { id: 'cash', name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
      { id: 'groceries', name: 'Groceries', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
      { id: 'salary', name: 'Salary', accountType: AccountType.INCOME, currencyCode: 'USD' },
    ];

    const { result } = renderHook(() =>
      useSplitJournalEditor({
        accounts: accounts as AccountFields[],
        workplaceCurrency: 'USD',
        editor,
      }),
    );

    act(() => result.current.setTransactionType('income'));

    expect(editor.setTransactionType).toHaveBeenCalledWith('income');
    expect(editor.updateLine).toHaveBeenCalledWith('source', {
      accountId: '',
      accountName: '',
      accountType: AccountType.INCOME,
      accountCurrency: undefined,
    });
    expect(editor.updateLine).toHaveBeenCalledWith('split-1', {
      accountId: '',
      accountName: '',
      accountType: AccountType.ASSET,
      accountCurrency: undefined,
    });
  });
});

const fetched = (sourceBaseRate: number | null, destBaseRate: number | null): FxFetchedRates => ({
  sourceBaseRate,
  destBaseRate,
  isLoading: false,
  error: null,
});

const fxAccounts = [
  { id: 'cash-usd', name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
  { id: 'cash-inr', name: 'Wallet', accountType: AccountType.ASSET, currencyCode: 'INR' },
  { id: 'cash-eur', name: 'Euro Cash', accountType: AccountType.ASSET, currencyCode: 'EUR' },
  { id: 'food-inr', name: 'Food', accountType: AccountType.EXPENSE, currencyCode: 'INR' },
  { id: 'rent-inr', name: 'Rent', accountType: AccountType.EXPENSE, currencyCode: 'INR' },
  { id: 'travel-usd', name: 'Travel', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
] as AccountFields[];

function fxLine(
  id: string,
  transactionType: TransactionType,
  accountId: string,
  amount: string,
  exchangeRate = '',
): JournalEntryLine {
  const account = fxAccounts.find(candidate => candidate.id === accountId)!;
  return {
    id: asTransactionId(id),
    accountId: asAccountId(accountId),
    accountName: account.name,
    accountType: account.accountType,
    accountCurrency: account.currencyCode,
    amount,
    transactionType,
    notes: '',
    exchangeRate,
  };
}

function renderStatefulSplit(initialLines: JournalEntryLine[], isEdit = false) {
  const updateLinesSpy = jest.fn();
  const hook = renderHook(() => {
    const [lines, setLines] = useState(initialLines);
    const updateLine = useCallback((id: string, patch: Partial<JournalEntryLine>) => {
      setLines(previous => previous.map(line => (line.id === id ? { ...line, ...patch } : line)));
    }, []);
    const updateLines = useCallback((updates: Record<string, Partial<JournalEntryLine>>) => {
      updateLinesSpy(updates);
      setLines(previous => previous.map(line => ({ ...line, ...updates[line.id] })));
    }, []);
    const editor = useMemo<UseSplitJournalEditorProps['editor']>(
      () => ({
        transactionType: 'expense',
        setTransactionType: jest.fn(),
        lines,
        isEdit,
        isSubmitting: false,
        journalDate: '2026-01-01',
        updateLine,
        updateLines,
        setLines,
        addLine: jest.fn(),
        setIsGuidedMode: jest.fn(),
      }),
      [lines, updateLine, updateLines],
    );
    const split = useSplitJournalEditor({ accounts: fxAccounts, workplaceCurrency: 'USD', editor });
    return { split, lines };
  });
  const line = (id: string) => hook.result.current.lines.find(candidate => candidate.id === id)!;
  return { ...hook, updateLinesSpy, line };
}

describe('useSplitJournalEditor FX rows', () => {
  it('converts a source-currency amount once the pair rate resolves', () => {
    mockUseCrossCurrencyRatesMap.mockReturnValue({ 'USD>INR': fetched(1, 0.01) });
    const { result, rerender, updateLinesSpy, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-usd', '8'),
      fxLine('food', TransactionType.DEBIT, 'food-inr', '8.00'),
    ]);

    rerender({});

    expect(updateLinesSpy).toHaveBeenCalledTimes(1);
    expect(line('food')).toMatchObject({ amount: '800.00', exchangeRate: '0.010000' });
    expect(result.current.split.splitFx.food).toMatchObject({
      inputAmount: '8.00',
      inputCurrency: 'USD',
    });
    expect(result.current.split.splitFx.food.pair.convertedAmount).toBe(800);
  });

  it('keeps an entered source amount when the rounded conversion does not invert exactly', () => {
    mockUseCrossCurrencyRatesMap.mockReturnValue({ 'USD>INR': fetched(1, 83.5) });
    const { result, rerender, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-usd', '100'),
      fxLine('food', TransactionType.DEBIT, 'food-inr', ''),
    ]);

    act(() => result.current.split.updateSplitInputAmount('food', '100'));
    rerender({});

    expect(line('food').amount).toBe('1.20');
    expect(result.current.split.splitFx.food.inputAmount).toBe('100');
    expect(Number(line('food').amount) * Number(line('food').exchangeRate)).toBeCloseTo(100, 2);
  });

  it('converts a parent-applied equal split after an initial zero amount', () => {
    mockUseCrossCurrencyRatesMap.mockReturnValue({ 'USD>INR': fetched(1, 0.01) });
    const { result, updateLinesSpy, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-usd', '8'),
      fxLine('food', TransactionType.DEBIT, 'food-inr', '0.00'),
    ]);
    expect(updateLinesSpy).not.toHaveBeenCalled();

    act(() => result.current.split.updateSplitAmounts({ food: '8.00' }));

    expect(line('food')).toMatchObject({ amount: '800.00', exchangeRate: '0.010000' });
  });

  it('publishes the fetched source rate before a zero foreign split is equalized', () => {
    mockUseCrossCurrencyRatesMap.mockReturnValue({ 'INR>USD': fetched(0.0104, 1) });
    const { line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-inr', '1000'),
      fxLine('travel', TransactionType.DEBIT, 'travel-usd', '0.00'),
    ]);

    expect(line('source').exchangeRate).toBe('0.010400');
    expect(line('travel')).toMatchObject({ amount: '0.00', exchangeRate: '' });
  });

  it('converts a workplace-currency row exactly once when the source rate arrives', () => {
    const { result, rerender, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-inr', '800'),
      fxLine('travel', TransactionType.DEBIT, 'travel-usd', ''),
    ]);

    act(() => result.current.split.updateSplitInputAmount('travel', '800'));
    expect(line('travel').amount).toBe('800');

    mockUseCrossCurrencyRatesMap.mockReturnValue({ 'INR>USD': fetched(0.0125, 1) });
    rerender({});
    rerender({});

    expect(line('travel')).toMatchObject({ amount: '10.00', exchangeRate: '' });
    expect(line('source').exchangeRate).toBe('0.012500');
    expect(result.current.split.splitFx.travel.inputAmount).toBe('800');
  });

  it('keeps saved rates and skips fetching when opening an existing entry', () => {
    const { result, updateLinesSpy } = renderStatefulSplit(
      [
        fxLine('source', TransactionType.CREDIT, 'cash-eur', '10', '1.1'),
        fxLine('travel', TransactionType.DEBIT, 'travel-usd', '11.00', '1'),
      ],
      true,
    );

    expect(mockUseCrossCurrencyRatesMap).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, workplaceCurrency: 'USD' }),
    );
    expect(updateLinesSpy).not.toHaveBeenCalled();
    expect(result.current.split.splitFx.travel.inputAmount).toBe('10.00');
  });

  it('resets to the market rate and re-persists the refreshed conversion', () => {
    mockUseCrossCurrencyRatesMap.mockReturnValue({ 'USD>INR': fetched(1, 0.01) });
    const { result, updateLinesSpy, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-usd', '8'),
      fxLine('food', TransactionType.DEBIT, 'food-inr', '8.00'),
    ]);
    expect(updateLinesSpy).toHaveBeenCalledTimes(1);

    act(() => result.current.split.resetSplitRate('food'));

    expect(updateLinesSpy).toHaveBeenNthCalledWith(2, {
      food: { amount: '8.00', exchangeRate: '' },
    });
    expect(updateLinesSpy).toHaveBeenCalledTimes(3);
    expect(line('food')).toMatchObject({ amount: '800.00', exchangeRate: '0.010000' });
    expect(mockUseCrossCurrencyRatesMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ refreshNonce: 1, enabled: true }),
    );
  });

  it('derives rates from an edited converted amount', () => {
    mockUseCrossCurrencyRatesMap.mockReturnValue({ 'USD>INR': fetched(1, 1 / 83) });
    const { result, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-usd', '50'),
      fxLine('food', TransactionType.DEBIT, 'food-inr', '4150.00', String(1 / 83)),
    ]);
    expect(result.current.split.splitFx.food.inputAmount).toBe('50.00');

    act(() => result.current.split.updateSplitConvertedAmount('food', '5000'));

    expect(line('food')).toMatchObject({ amount: '5000.00', exchangeRate: '0.010000' });
  });

  it('accepts a converted amount when no market rate is available', () => {
    const { result, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-usd', '50'),
      fxLine('food', TransactionType.DEBIT, 'food-inr', '50.00'),
    ]);
    expect(result.current.split.splitFx.food.pair.convertedAmount).toBeNull();

    act(() => result.current.split.updateSplitConvertedAmount('food', '4150'));

    expect(line('food')).toMatchObject({ amount: '4150.00', exchangeRate: '0.012048' });
  });

  it('keeps the entered source amount when switching to another foreign category', () => {
    mockUseCrossCurrencyRatesMap.mockReturnValue({ 'USD>INR': fetched(1, 1 / 83) });
    const { result, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-usd', '50'),
      fxLine('food', TransactionType.DEBIT, 'food-inr', '4150.00', String(1 / 83)),
    ]);

    act(() => result.current.split.updateSplitRow('food', { accountId: asAccountId('rent-inr') }));

    expect(line('food')).toMatchObject({
      accountId: 'rent-inr',
      amount: '4150.00',
      exchangeRate: '0.012048',
    });
    expect(result.current.split.splitFx.food.inputAmount).toBe('50.00');
  });
});
