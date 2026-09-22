import { act, renderHook } from '@testing-library/react-native';
import { useJournalEntryAccountPicker } from '../useJournalEntryAccountPicker';
import { AppNavigation } from '@/src/utils/navigation';

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { toAccountForm: jest.fn() },
}));

jest.mock('@/src/utils/accountCreationReturn', () => ({
  registerAccountCreationReturn: jest.fn(() => 'return-token'),
}));

describe('useJournalEntryAccountPicker', () => {
  it('allows source account creation without an allocation row', () => {
    const applyAccountToActiveLine = jest.fn();
    const editor = {
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
      ],
      transactionType: 'expense',
      resolveActiveLineId: jest.fn(),
      getLineIdByRole: jest.fn(),
    } as any;

    const { result } = renderHook(() =>
      useJournalEntryAccountPicker({
        accounts: [],
        editor,
        activeMode: 'allocation',
        applyAccountToActiveLine,
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
        returnToken: 'return-token',
      }),
    );
  });
});
