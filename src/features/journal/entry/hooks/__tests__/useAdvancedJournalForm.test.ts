import { useAdvancedJournalForm } from '@/src/features/journal/entry/hooks/useAdvancedJournalForm';
import { AccountType, TransactionType } from '@/src/types/enums';
import type { JournalEntryLine } from '@/src/types/domainJournal';
import { asAccountId, asTransactionId } from '@/src/types/ids';
import { act, renderHook } from '@testing-library/react-native';
import { useState } from 'react';

jest.mock('@/src/features/journal/hooks/useAccountSelection', () => ({
  useAccountSelection: jest.fn(({ accounts }) => ({ leafAccounts: accounts })),
}));

function line(
  id: string,
  transactionType: TransactionType,
  amount: string,
  extras: Partial<JournalEntryLine> = {},
): JournalEntryLine {
  return {
    id: asTransactionId(id),
    accountId: asAccountId(id),
    accountName: id,
    accountType: AccountType.ASSET,
    accountCurrency: 'USD',
    amount,
    transactionType,
    notes: '',
    exchangeRate: '',
    ...extras,
  };
}

function renderForm(initial: JournalEntryLine[]) {
  return renderHook(() => {
    const [lines, setLines] = useState(initial);
    const form = useAdvancedJournalForm({
      editor: {
        lines,
        addLine: jest.fn(),
        removeLine: id => setLines(current => current.filter(row => row.id !== id)),
        updateLine: (id, patch) =>
          setLines(current => current.map(row => (row.id === id ? { ...row, ...patch } : row))),
        updateLines: batch =>
          setLines(current =>
            current.map(row => (batch[row.id] ? { ...row, ...batch[row.id] } : row)),
          ),
        fetchRatesForLines: jest.fn(),
      },
      accounts: [],
      workplaceCurrency: 'USD',
    });
    return form;
  });
}

describe('useAdvancedJournalForm', () => {
  it('removes a To row after From has been emptied', () => {
    const { result } = renderForm([
      line('cash', TransactionType.CREDIT, '40'),
      line('food', TransactionType.DEBIT, '20'),
      line('drink', TransactionType.DEBIT, '20'),
    ]);

    act(() => result.current.moveLine('cash'));
    expect(result.current.canRemoveTo).toBe(true);

    act(() => result.current.removeLine('food'));

    expect(result.current.fromLines).toEqual([]);
    expect(result.current.toLines.map(row => row.id).sort()).toEqual(['cash', 'drink']);
  });

  it('moves a From row to To by flipping it to a debit', () => {
    const { result } = renderForm([
      line('cash', TransactionType.CREDIT, '40'),
      line('food', TransactionType.DEBIT, '40'),
    ]);

    act(() => result.current.moveLine('cash'));

    expect(result.current.fromLines).toEqual([]);
    expect(result.current.toLines.map(row => row.id).sort()).toEqual(['cash', 'food']);
    expect(result.current.toLines.find(row => row.id === 'cash')?.transactionType).toBe(
      TransactionType.DEBIT,
    );
  });

  it('equalizes the To rows against the From total', () => {
    const { result } = renderForm([
      line('cash', TransactionType.CREDIT, '100'),
      line('food', TransactionType.DEBIT, '0'),
      line('drink', TransactionType.DEBIT, '0'),
    ]);

    act(() => result.current.equalizeToLines());

    const amounts = result.current.toLines.map(row => row.amount).sort();
    expect(amounts).toEqual(['50.00', '50.00']);
  });

  it('distributes the leftover From amount onto an empty To row', () => {
    const { result } = renderForm([
      line('cash', TransactionType.CREDIT, '100'),
      line('food', TransactionType.DEBIT, '40'),
      line('drink', TransactionType.DEBIT, '0'),
    ]);

    act(() => result.current.distributeToLines());

    const byId = Object.fromEntries(result.current.toLines.map(row => [row.id, row.amount]));
    expect(byId.food).toBe('40');
    expect(byId.drink).toBe('60.00');
  });

  it('keeps Equal split and Distribute off while a foreign To row has no rate', () => {
    const { result } = renderForm([
      line('cash', TransactionType.CREDIT, '100'),
      line('euro', TransactionType.DEBIT, '0', { accountCurrency: 'EUR' }),
    ]);

    expect(result.current.canEqualize).toBe(false);
    expect(result.current.canDistribute).toBe(false);

    act(() => {
      result.current.equalizeToLines();
      result.current.distributeToLines();
    });

    expect(result.current.toLines[0].amount).toBe('0');
  });

  it('refreshes one foreign row without clearing another row in the same currency', () => {
    const { result } = renderForm([
      line('euro-from', TransactionType.CREDIT, '10', {
        accountCurrency: 'EUR',
        exchangeRate: '1.1',
      }),
      line('euro-to', TransactionType.DEBIT, '4', {
        accountCurrency: 'EUR',
        exchangeRate: '1.2',
      }),
    ]);

    act(() => result.current.resetRate('euro-from'));

    expect(result.current.fromLines[0].exchangeRate).toBe('');
    expect(result.current.toLines[0].exchangeRate).toBe('1.2');
    expect(result.current.rowFx['euro-from'].pair.isLoading).toBe(true);
    expect(result.current.rowFx['euro-to'].pair.isLoading).toBe(false);
    expect(result.current.rowFx['euro-to'].pair.sourceBaseRate).toBeCloseTo(1.2);
  });
});
