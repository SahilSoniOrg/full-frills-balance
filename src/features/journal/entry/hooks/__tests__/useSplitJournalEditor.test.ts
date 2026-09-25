import { renderHook, act } from '@testing-library/react-native';
import { useCallback, useMemo, useState } from 'react';
import { AccountType, TransactionType } from '@/src/types/enums';
import { asAccountId, asTransactionId, type AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { type UseSplitJournalEditorProps, useSplitJournalEditor } from '../useSplitJournalEditor';
import type { JournalEntryLine } from '@/src/types/domainJournal';

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
    fetchRatesForLines: jest.fn(),
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
  const fetchRatesForLines = jest.fn();
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
        fetchRatesForLines,
        setIsGuidedMode: jest.fn(),
      }),
      [lines, updateLine, updateLines],
    );
    const split = useSplitJournalEditor({ accounts: fxAccounts, workplaceCurrency: 'USD', editor });
    return { split, lines };
  });
  const line = (id: string) => hook.result.current.lines.find(candidate => candidate.id === id)!;
  return { ...hook, updateLinesSpy, fetchRatesForLines, line };
}

describe('useSplitJournalEditor FX rows', () => {
  it('shows the workplace rate on a foreign allocation and keeps that row in its own currency', () => {
    const { result } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-usd', '8'),
      fxLine('food', TransactionType.DEBIT, 'food-inr', '800.00', '0.01'),
    ]);

    expect(result.current.split.sourceFx.pair.isCrossCurrency).toBe(false);
    expect(result.current.split.splitFx.food).toMatchObject({
      inputAmount: '800.00',
      inputCurrency: 'INR',
    });
    expect(result.current.split.splitFx.food.pair).toMatchObject({
      isCrossCurrency: true,
      sourceCurrency: 'INR',
      destCurrency: 'USD',
    });
    expect(result.current.split.splitFx.food.pair.convertedAmount).toBeCloseTo(8);
  });

  it('puts the workplace rate on the foreign source row and leaves a workplace allocation in its own currency', () => {
    const { result } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-eur', '40', '1.137'),
      fxLine('travel', TransactionType.DEBIT, 'travel-usd', '45.48'),
    ]);

    expect(result.current.split.sourceFx).toMatchObject({
      inputAmount: '40',
      inputCurrency: 'EUR',
    });
    expect(result.current.split.sourceFx.pair).toMatchObject({
      isCrossCurrency: true,
      sourceCurrency: 'EUR',
      destCurrency: 'USD',
    });
    expect(result.current.split.splitFx.travel).toMatchObject({
      inputAmount: '45.48',
      inputCurrency: 'USD',
    });
    expect(result.current.split.splitFx.travel.pair.isCrossCurrency).toBe(false);
  });

  it('shows a workplace rate on every row that shares a foreign currency', () => {
    const { result } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-eur', '10', '1.137'),
      fxLine('spend', TransactionType.DEBIT, 'cash-eur', '4', '1.2'),
    ]);

    expect(result.current.split.sourceFx.pair.isCrossCurrency).toBe(true);
    expect(result.current.split.sourceFx.pair.sourceBaseRate).toBeCloseTo(1.137);
    expect(result.current.split.splitFx.spend).toMatchObject({
      inputAmount: '4',
      inputCurrency: 'EUR',
    });
    expect(result.current.split.splitFx.spend.pair.sourceBaseRate).toBeCloseTo(1.2);
  });

  it('stores a typed allocation in the account currency', () => {
    const { result, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-eur', '40', '1.137'),
      fxLine('travel', TransactionType.DEBIT, 'travel-usd', ''),
    ]);

    act(() => result.current.split.updateAmount('travel', '45.48'));

    expect(line('travel')).toMatchObject({ amount: '45.48', exchangeRate: '' });
    expect(result.current.split.splitFx.travel.inputCurrency).toBe('USD');
    expect(line('source').exchangeRate).toBe('1.137');
  });

  it('keeps a saved source rate on the source row when opening an existing entry', () => {
    const { result, updateLinesSpy } = renderStatefulSplit(
      [
        fxLine('source', TransactionType.CREDIT, 'cash-eur', '10', '1.1'),
        fxLine('travel', TransactionType.DEBIT, 'travel-usd', '11.00'),
      ],
      true,
    );

    expect(updateLinesSpy).not.toHaveBeenCalled();
    expect(result.current.split.sourceFx.inputAmount).toBe('10');
    expect(result.current.split.sourceFx.pair.sourceBaseRate).toBeCloseTo(1.1);
    expect(result.current.split.splitFx.travel).toMatchObject({
      inputAmount: '11.00',
      inputCurrency: 'USD',
    });
  });

  it('copies the source rate once onto a same-currency allocation saved without one', () => {
    const { result, line } = renderStatefulSplit(
      [
        fxLine('source', TransactionType.CREDIT, 'cash-eur', '10', '1.1'),
        fxLine('spend', TransactionType.DEBIT, 'cash-eur', '4', ''),
      ],
      true,
    );

    expect(line('spend').exchangeRate).toBe('1.1');
    expect(line('source').exchangeRate).toBe('1.1');

    act(() => result.current.split.resetRate('spend'));

    expect(line('spend').exchangeRate).toBe('');
    expect(line('source').exchangeRate).toBe('1.1');
  });

  it('leaves a new same-currency allocation for the line fetcher', () => {
    const { updateLinesSpy, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-eur', '10', '1.1'),
      fxLine('spend', TransactionType.DEBIT, 'cash-eur', '4', ''),
    ]);

    expect(updateLinesSpy).not.toHaveBeenCalled();
    expect(line('spend').exchangeRate).toBe('');
  });

  it('refreshes only the row whose rate was reset', () => {
    const { result, fetchRatesForLines, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-eur', '10', '1.1'),
      fxLine('spend', TransactionType.DEBIT, 'cash-eur', '4', '1.2'),
    ]);

    act(() => result.current.split.resetRate('spend'));

    expect(line('spend').exchangeRate).toBe('');
    expect(line('source').exchangeRate).toBe('1.1');
    expect(fetchRatesForLines).toHaveBeenCalledTimes(1);
    expect(fetchRatesForLines).toHaveBeenCalledWith(['spend'], true);
    expect(result.current.split.splitFx.spend.pair.isLoading).toBe(false);
    expect(result.current.split.sourceFx.pair.isLoading).toBe(false);
  });

  it('derives one line rate from an edited workplace amount', () => {
    const { result, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-usd', '50'),
      fxLine('food', TransactionType.DEBIT, 'food-inr', '4150.00', '0.012048'),
    ]);

    act(() => result.current.split.updateConvertedAmount('food', '50'));

    expect(line('food')).toMatchObject({ amount: '4150.00', exchangeRate: '0.012048' });
    expect(line('source').exchangeRate).toBe('');
  });

  it('keeps the account-currency amount when switching to another account in that currency', () => {
    const { result, line } = renderStatefulSplit([
      fxLine('source', TransactionType.CREDIT, 'cash-usd', '50'),
      fxLine('food', TransactionType.DEBIT, 'food-inr', '4150.00', '0.012048'),
    ]);

    act(() => result.current.split.updateSplitRow('food', { accountId: asAccountId('rent-inr') }));

    expect(line('food')).toMatchObject({
      accountId: 'rent-inr',
      amount: '4150.00',
      exchangeRate: '',
    });
    expect(result.current.split.splitFx.food).toMatchObject({
      inputAmount: '4150.00',
      inputCurrency: 'INR',
    });
  });
});
