import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccountType } from '@/src/types/enums';
import { asAccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { useTransactionComposerSession } from '../useTransactionComposerSession';

jest.mock('@/src/services/journal/journalDomainService');
jest.mock('@/src/services/journal/journalReadService', () => ({
  journalReadService: { find: jest.fn(), getJournalForEditor: jest.fn() },
}));
jest.mock('@/src/services/transaction-ingestion');
jest.mock('@/src/data/repositories/transaction');
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: jest.fn() })),
}));
jest.mock('@/src/hooks/useAdvancedModePrefs', () => ({
  useAdvancedModePrefs: jest.fn(() => ({ advancedMode: false, setAdvancedMode: jest.fn() })),
}));
jest.mock('@/src/hooks/useExchangeRate', () => ({
  useExchangeRate: jest.fn(() => ({ fetchRate: jest.fn() })),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: jest.fn(() => ({ workplaceId: 'wp-1', defaultCurrencyCode: 'USD' })),
}));

describe('useTransactionComposerSession', () => {
  const accounts = [
    {
      id: asAccountId('cash'),
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    },
    {
      id: asAccountId('food'),
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
    },
  ];

  it('exposes one editable intent and derived posting plan', () => {
    const { result } = renderHook(() =>
      useTransactionComposerSession('wp-1' as WorkplaceId, {
        accounts,
        currencyCode: 'USD',
        initialDescription: 'Coffee',
        initialAmount: '12.50',
        initialSourceId: asAccountId('cash'),
        initialDestinationId: asAccountId('food'),
        initialDate: '2026-08-25',
      }),
    );

    expect(result.current.intent).toMatchObject({
      description: 'Coffee',
      amount: '12.50',
      sourceAccountId: asAccountId('cash'),
      destinationAccountId: asAccountId('food'),
    });
    expect(result.current.postingPlan!.lines).toHaveLength(2);
    expect(result.current.postingPlan!.currencyCode).toBe('USD');
    expect(result.current.postingPlanValidation).toHaveProperty('valid');
  });

  it('assembles Split allocations through the session submit command', async () => {
    const { journalService } = jest.requireMock('@/src/services/journal/journalDomainService');
    journalService.postPostingPlan.mockResolvedValue({ success: true, action: 'created' });

    const { result } = renderHook(() =>
      useTransactionComposerSession('wp-1' as WorkplaceId, {
        accounts,
        currencyCode: 'USD',
        initialAmount: '50',
        initialDate: '2026-08-25',
      }),
    );

    act(() => {
      result.current.editor.addLine();
    });

    act(() => {
      const sourceLine = result.current.editor.lines.find(
        line => line.transactionType === 'CREDIT',
      );
      const destinationLines = result.current.editor.lines.filter(
        line => line.transactionType === 'DEBIT',
      );
      result.current.editor.updateLine(sourceLine!.id, { accountId: asAccountId('cash') });
      result.current.editor.updateLine(destinationLines[0].id, {
        accountId: asAccountId('food'),
        amount: '30',
      });
      result.current.editor.updateLine(destinationLines[1].id, {
        accountId: asAccountId('food'),
        amount: '20',
      });
    });

    await act(async () => {
      await result.current.submit('allocation');
    });

    expect(journalService.postPostingPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          description: 'Split expense',
          lines: expect.arrayContaining([
            expect.objectContaining({ accountId: asAccountId('cash'), amount: '50' }),
            expect.objectContaining({ accountId: asAccountId('food'), amount: '30' }),
            expect.objectContaining({ accountId: asAccountId('food'), amount: '20' }),
          ]),
        }),
      }),
    );
  });

  it('keeps allocation amounts independent from the source amount', () => {
    const { result } = renderHook(() =>
      useTransactionComposerSession('wp-1' as WorkplaceId, {
        accounts,
        currencyCode: 'USD',
        initialAmount: '50',
        initialDate: '2026-08-25',
      }),
    );

    act(() => result.current.editor.addLine());
    const rows = result.current.editor.lines.filter(line => line.transactionType === 'DEBIT');
    const sourceLine = result.current.editor.lines.find(line => line.transactionType === 'CREDIT')!;
    act(() => {
      result.current.editor.updateLine(rows[0].id, { amount: '30' });
      result.current.editor.updateLine(rows[1].id, { amount: '20' });
      result.current.editor.updateLine(sourceLine.id, { amount: '75' });
    });

    expect(result.current.splitState.totalAmount).toBe('75');
    expect(result.current.editor.lines.find(line => line.id === rows[0].id)?.amount).toBe('30');
    expect(result.current.editor.lines.find(line => line.id === rows[1].id)?.amount).toBe('20');
  });

  it('derives intent amount from allocations when the source amount is empty', () => {
    const { result } = renderHook(() =>
      useTransactionComposerSession('wp-1' as WorkplaceId, {
        accounts,
        currencyCode: 'USD',
        initialDate: '2026-08-25',
      }),
    );

    act(() => result.current.editor.addLine());
    const rows = result.current.editor.lines.filter(line => line.transactionType === 'DEBIT');
    act(() => {
      result.current.editor.updateLine(rows[0].id, { amount: '30' });
      result.current.editor.updateLine(rows[1].id, { amount: '20' });
    });

    expect(result.current.intent.amount).toBe('50');
  });

  it('hydrates the allocation amount after an async edit load', async () => {
    const { journalReadService } = jest.requireMock('@/src/services/journal/journalReadService');
    journalReadService.getJournalForEditor.mockResolvedValue({
      journal: {
        journalDate: '2026-08-25T12:00:00.000Z',
        description: 'Loaded allocation',
        notes: '',
      },
      lines: [
        {
          id: '1',
          accountId: asAccountId('food'),
          accountName: 'Food',
          accountType: AccountType.EXPENSE,
          accountCurrency: 'USD',
          amount: '75',
          transactionType: 'DEBIT',
          notes: '',
          exchangeRate: '',
        },
        {
          id: '2',
          accountId: asAccountId('cash'),
          accountName: 'Cash',
          accountType: AccountType.ASSET,
          accountCurrency: 'USD',
          amount: '75',
          transactionType: 'CREDIT',
          notes: '',
          exchangeRate: '',
        },
      ],
      transactionType: 'expense',
      forceAdvancedMode: false,
    });

    const { result } = renderHook(() =>
      useTransactionComposerSession('wp-1' as WorkplaceId, {
        accounts,
        currencyCode: 'USD',
        journalId: 'journal-1' as JournalId,
      }),
    );

    await waitFor(() => expect(result.current.editor.loadState).toBe('loaded'));
    expect(result.current.splitState.totalAmount).toBe('75');
  });
});
