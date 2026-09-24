import { act, renderHook } from '@testing-library/react-native';
import { useJournalEntryAccountPicker } from '../useJournalEntryAccountPicker';
import { AppNavigation } from '@/src/utils/navigation';
import { encodeAccountCreationReturnTarget } from '@/src/utils/accountCreationReturn';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { toAccountForm: jest.fn() },
}));

const mockNavigation = { setParams: jest.fn() };
let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  useLocalSearchParams: () => mockSearchParams,
}));

function createEditor() {
  return {
    lines: [
      {
        id: 'source-line',
        accountId: 'cash',
        accountName: 'Cash',
        accountType: 'ASSET',
        amount: '50',
        transactionType: 'CREDIT',
        notes: '',
        exchangeRate: '',
      },
      {
        id: 'destination-line',
        accountId: '',
        accountName: '',
        accountType: 'EXPENSE',
        amount: '50',
        transactionType: 'DEBIT',
        notes: '',
        exchangeRate: '',
      },
    ],
    transactionType: 'expense',
    resolveActiveLineId: jest.fn((id: string) => id),
    getLineIdByRole: jest.fn((role: string) =>
      role === 'source' ? 'source-line' : 'destination-line',
    ),
  } as any;
}

function createBatchEditor() {
  return {
    rows: [{ id: 'row-1', transactionType: 'expense' }],
    rowActions: {
      setSourceAccount: jest.fn(),
      setDestinationAccount: jest.fn(),
    },
  } as any;
}

describe('useJournalEntryAccountPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
  });

  it('allows source account creation without an allocation row', () => {
    const { result } = renderHook(() =>
      useJournalEntryAccountPicker({
        accounts: [],
        editor: createEditor(),
        activeMode: 'allocation',
        applyAccountToActiveLine: jest.fn(),
        splitRows: [],
      }),
    );

    act(() => {
      result.current.onCreateAccountRequestForSplitRow('', 'source', {
        suggestedName: 'New cash account',
      });
    });

    expect(AppNavigation.toAccountForm).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        name: 'New cash account',
        returnTarget: { kind: 'line', lineId: SPLIT_SOURCE_LINE_ID },
      }),
    );
  });

  it('asks the account form to return to the picked line and batch row', () => {
    const { result } = renderHook(() =>
      useJournalEntryAccountPicker({
        accounts: [],
        editor: createEditor(),
        activeMode: 'basic',
        applyAccountToActiveLine: jest.fn(),
        batchEditor: createBatchEditor(),
      }),
    );

    act(() => {
      result.current.onSelectAccountRequest('destination-line');
    });
    act(() => {
      result.current.onCreateAccountRequest({ suggestedName: 'Groceries' });
    });
    act(() => {
      result.current.onCreateAccountRequestForBatchRow('row-1', 'source', {
        suggestedName: 'Wallet',
      });
    });

    expect(AppNavigation.toAccountForm).toHaveBeenNthCalledWith(
      1,
      undefined,
      expect.objectContaining({ returnTarget: { kind: 'line', lineId: 'destination-line' } }),
    );
    expect(AppNavigation.toAccountForm).toHaveBeenNthCalledWith(
      2,
      undefined,
      expect.objectContaining({
        returnTarget: { kind: 'batchRow', rowId: 'row-1', role: 'source' },
      }),
    );
  });

  it('applies a returned account to the intended line with the latest editor callback', () => {
    const staleApply = jest.fn();
    const latestApply = jest.fn();
    const { rerender } = renderHook(
      ({ applyAccountToActiveLine }: { applyAccountToActiveLine: jest.Mock }) =>
        useJournalEntryAccountPicker({
          accounts: [],
          editor: createEditor(),
          activeMode: 'basic',
          applyAccountToActiveLine,
        }),
      { initialProps: { applyAccountToActiveLine: staleApply } },
    );

    mockSearchParams = {
      createdAccountId: 'new-account',
      createdAccountTarget: encodeAccountCreationReturnTarget({
        kind: 'line',
        lineId: 'destination-line',
      }),
    };
    rerender({ applyAccountToActiveLine: latestApply });

    expect(staleApply).not.toHaveBeenCalled();
    expect(latestApply).toHaveBeenCalledTimes(1);
    expect(latestApply).toHaveBeenCalledWith('destination-line', 'new-account');
    expect(mockNavigation.setParams).toHaveBeenCalledWith({
      createdAccountId: undefined,
      createdAccountTarget: undefined,
    });
  });

  it.each(['source', 'destination'] as const)(
    'applies a returned account to the intended batch row %s side',
    role => {
      const batchEditor = createBatchEditor();
      mockSearchParams = {
        createdAccountId: 'new-account',
        createdAccountTarget: encodeAccountCreationReturnTarget({
          kind: 'batchRow',
          rowId: 'row-1',
          role,
        }),
      };

      renderHook(() =>
        useJournalEntryAccountPicker({
          accounts: [],
          editor: createEditor(),
          activeMode: 'batch',
          applyAccountToActiveLine: jest.fn(),
          batchEditor,
        }),
      );

      const [applied, untouched] =
        role === 'source'
          ? [batchEditor.rowActions.setSourceAccount, batchEditor.rowActions.setDestinationAccount]
          : [batchEditor.rowActions.setDestinationAccount, batchEditor.rowActions.setSourceAccount];
      expect(applied).toHaveBeenCalledWith('row-1', 'new-account');
      expect(untouched).not.toHaveBeenCalled();
    },
  );

  it('consumes a returned account only once while the param is still present', () => {
    const applyAccountToActiveLine = jest.fn();
    mockSearchParams = {
      createdAccountId: 'new-account',
      createdAccountTarget: encodeAccountCreationReturnTarget({
        kind: 'line',
        lineId: 'source-line',
      }),
    };

    const { rerender } = renderHook(
      ({ apply }: { apply: jest.Mock }) =>
        useJournalEntryAccountPicker({
          accounts: [],
          editor: createEditor(),
          activeMode: 'basic',
          applyAccountToActiveLine: apply,
        }),
      { initialProps: { apply: applyAccountToActiveLine } },
    );
    rerender({ apply: jest.fn(applyAccountToActiveLine) });
    rerender({ apply: applyAccountToActiveLine });

    expect(applyAccountToActiveLine).toHaveBeenCalledTimes(1);
    expect(mockNavigation.setParams).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no account was returned', () => {
    const applyAccountToActiveLine = jest.fn();
    const batchEditor = createBatchEditor();

    renderHook(() =>
      useJournalEntryAccountPicker({
        accounts: [],
        editor: createEditor(),
        activeMode: 'basic',
        applyAccountToActiveLine,
        batchEditor,
      }),
    );

    expect(applyAccountToActiveLine).not.toHaveBeenCalled();
    expect(batchEditor.rowActions.setSourceAccount).not.toHaveBeenCalled();
    expect(mockNavigation.setParams).not.toHaveBeenCalled();
  });

  it('clears but ignores a returned account with an unreadable target', () => {
    const applyAccountToActiveLine = jest.fn();
    mockSearchParams = { createdAccountId: 'new-account', createdAccountTarget: 'garbage' };

    renderHook(() =>
      useJournalEntryAccountPicker({
        accounts: [],
        editor: createEditor(),
        activeMode: 'basic',
        applyAccountToActiveLine,
      }),
    );

    expect(applyAccountToActiveLine).not.toHaveBeenCalled();
    expect(mockNavigation.setParams).toHaveBeenCalledTimes(1);
  });
});
