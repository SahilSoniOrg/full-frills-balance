import { renderHook, act } from '@testing-library/react-native';
import { useTransactionInboxImport } from '../useTransactionInboxImport';
import { loadAccountMatcherContext } from '@/src/services/accounts/accountMatcherContext';
import { recognizeSmsAccounts } from '@/src/services/sms/recognition/accountMatcherEvaluator';
import { alert } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';

jest.mock('@/src/services/accounts/accountMatcherContext', () => ({
  loadAccountMatcherContext: jest.fn(),
}));
jest.mock('@/src/services/sms/recognition/accountMatcherEvaluator', () => ({
  recognizeSmsAccounts: jest.fn(),
}));
jest.mock('@/src/contexts/PrivacyScope', () => ({ useEffectivePrivacyMode: () => false }));
jest.mock('@/src/utils/alerts', () => ({ alert: { show: jest.fn() } }));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { toJournalEntry: jest.fn() } }));

it('warns when recognition is incomplete and opens an unfilled entry', async () => {
  const card = asAccountId('card');
  const savings = asAccountId('savings');
  jest
    .mocked(loadAccountMatcherContext)
    .mockResolvedValue({ matchers: [], eligibleAccountIds: [card, savings] } as never);
  jest
    .mocked(recognizeSmsAccounts)
    .mockReturnValue({ status: 'indeterminate', accountIds: [savings], outcomes: [] });
  const accounts = [
    { id: card, name: 'Card' },
    { id: savings, name: 'Savings' },
  ] as never;
  const { result } = renderHook(() =>
    useTransactionInboxImport({ accounts, workplaceId: asWorkplaceId('wp') }),
  );
  await act(async () => {
    await result.current({
      id: 'sms',
      channel: 'sms',
      deviceSourceId: '1',
      inputDate: 1,
      parseStatus: 'parsed',
      processingStatus: 'pending',
      direction: 'debit',
    });
  });
  expect(alert.show).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.stringContaining('The account could not be confirmed'),
    }),
  );
  expect(AppNavigation.toJournalEntry).not.toHaveBeenCalled();
  jest.mocked(alert.show).mock.calls[0][0].onAction?.();
  expect(AppNavigation.toJournalEntry).toHaveBeenCalledWith(
    expect.objectContaining({ params: expect.not.objectContaining({ sourceAccountId: card }) }),
  );
});
