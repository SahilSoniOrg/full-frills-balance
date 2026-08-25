import { act, renderHook } from '@testing-library/react-native';
import { AccountType } from '@/src/types/enums';
import { asAccountId, WorkplaceId } from '@/src/types/ids';
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
    expect(result.current.postingPlan.lines).toHaveLength(2);
    expect(result.current.postingPlan.currencyCode).toBe('USD');
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
      result.current.splitDraft.setSourceAccountId(asAccountId('cash'));
      result.current.splitDraft.updateSplitRow(result.current.splitDraft.splits[0].id, {
        accountId: asAccountId('food'),
        amount: '30',
      });
      result.current.splitDraft.updateSplitRow(result.current.splitDraft.splits[1].id, {
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
});
