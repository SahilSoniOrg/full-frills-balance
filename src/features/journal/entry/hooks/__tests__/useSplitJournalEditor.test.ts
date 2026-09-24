import { renderHook, act } from '@testing-library/react-native';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { useJournalEditor } from '../useJournalEditor';
import { useSplitJournalEditor } from '../useSplitJournalEditor';

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
  useCurrencyPrecision: () => ({ precision: 2 }),
}));

function createEditor(sourceAccountId = 'cash') {
  const lines = [
    {
      id: 'source',
      accountId: sourceAccountId,
      accountName: 'Cash',
      accountType: AccountType.ASSET,
      accountCurrency: 'USD',
      amount: '50',
      transactionType: TransactionType.CREDIT,
      exchangeRate: '',
    },
    {
      id: 'split-1',
      accountId: 'groceries',
      accountName: 'Groceries',
      accountType: AccountType.EXPENSE,
      accountCurrency: 'USD',
      amount: '25',
      transactionType: TransactionType.DEBIT,
      exchangeRate: '',
    },
    {
      id: 'split-2',
      accountId: 'bills',
      accountName: 'Bills',
      accountType: AccountType.EXPENSE,
      accountCurrency: 'USD',
      amount: '25',
      transactionType: TransactionType.DEBIT,
      exchangeRate: '',
    },
  ];

  return {
    transactionType: 'expense',
    setTransactionType: jest.fn(),
    lines,
    isEdit: false,
    isSubmitting: false,
    updateLine: jest.fn((id: string, patch: Record<string, unknown>) => {
      const line = lines.find(candidate => candidate.id === id);
      if (line) Object.assign(line, patch);
    }),
    updateLines: jest.fn((updates: Record<string, Record<string, unknown>>) => {
      lines.forEach(line => {
        if (updates[line.id]) Object.assign(line, updates[line.id]);
      });
    }),
    setLines: jest.fn((nextLines: unknown) => {
      const next =
        typeof nextLines === 'function'
          ? (nextLines as (current: typeof lines) => typeof lines)(lines)
          : (nextLines as typeof lines);
      lines.splice(0, lines.length, ...next);
    }),
    addLine: jest.fn(),
    removeLine: jest.fn(),
    setIsGuidedMode: jest.fn(),
  } as ReturnType<typeof useJournalEditor>;
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
