import { act, renderHook } from '@testing-library/react-native';
import { asWorkplaceId } from '@/src/types/ids';
import {
  readLatestAccountMatcherMessages,
  type AccountMatcherOlderMessagePage,
} from '@/src/services/accounts/accountMatcherOlderMessages';
import { useAccountMatcherOlderMessages } from '../useAccountMatcherOlderMessages';

jest.mock('@/src/services/accounts/accountMatcherOlderMessages', () => ({
  readLatestAccountMatcherMessages: jest.fn(),
  readOlderAccountMatcherMessages: jest.fn(),
}));

it('discards an in-flight page when the workplace changes', async () => {
  let resolvePage!: (page: AccountMatcherOlderMessagePage) => void;
  jest.mocked(readLatestAccountMatcherMessages).mockReturnValueOnce(
    new Promise(resolve => {
      resolvePage = resolve;
    }),
  );
  const first = asWorkplaceId('first');
  const second = asWorkplaceId('second');
  const { result, rerender } = renderHook(
    ({ workplaceId }: { workplaceId: typeof first }) => useAccountMatcherOlderMessages(workplaceId),
    { initialProps: { workplaceId: first } },
  );

  let pending!: Promise<void>;
  act(() => {
    pending = result.current.loadOlderMessages();
  });
  rerender({ workplaceId: second });
  await act(async () => {
    resolvePage({ messages: [], nextCursor: null, hasMore: false });
    await pending;
  });

  expect(result.current.olderMessages).toEqual([]);
  expect(result.current.olderMessagesLoaded).toBe(false);
  expect(result.current.isLoadingOlderMessages).toBe(false);

  jest.mocked(readLatestAccountMatcherMessages).mockResolvedValueOnce({
    messages: [],
    nextCursor: null,
    hasMore: false,
  });
  await act(async () => result.current.loadOlderMessages());
  expect(readLatestAccountMatcherMessages).toHaveBeenLastCalledWith(second);
  expect(result.current.olderMessagesLoaded).toBe(true);
});
