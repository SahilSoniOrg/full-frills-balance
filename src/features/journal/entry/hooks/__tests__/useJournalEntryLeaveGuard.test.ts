import { act, renderHook, waitFor } from '@testing-library/react-native';
import { confirm } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useJournalEntryLeaveGuard } from '../useJournalEntryLeaveGuard';

const mockDispatch = jest.fn();
let mockPreventRemove = false;
let mockPreventCallback: ((event: { data: { action: { type: string } } }) => void) | undefined;

jest.mock('expo-router', () => ({
  useNavigation: () => ({ dispatch: mockDispatch }),
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (
    enabled: boolean,
    callback: (event: { data: { action: { type: string } } }) => void,
  ) => {
    mockPreventRemove = enabled;
    mockPreventCallback = callback;
  },
}));
jest.mock('@/src/utils/alerts', () => ({ confirm: { show: jest.fn() } }));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { back: jest.fn() } }));

function latestConfirm() {
  return (confirm.show as jest.Mock).mock.calls.at(-1)?.[0] as { onConfirm: () => void };
}

describe('useJournalEntryLeaveGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreventRemove = false;
    mockPreventCallback = undefined;
  });

  it('prompts before closing a changed journal draft', async () => {
    const { result, rerender } = renderHook(
      ({ fingerprint }: { fingerprint: string }) =>
        useJournalEntryLeaveGuard({ fingerprint, baselineReady: true }),
      { initialProps: { fingerprint: 'initial' } as { fingerprint: string } },
    );
    await waitFor(() => expect(result.current.hasBaseline).toBe(true));
    rerender({ fingerprint: 'changed' });
    await waitFor(() => expect(result.current.isDirty).toBe(true));
    expect(mockPreventRemove).toBe(true);

    act(() => result.current.onClose());
    expect(AppNavigation.back).not.toHaveBeenCalled();
    act(() => latestConfirm().onConfirm());
    await waitFor(() => expect(AppNavigation.back).toHaveBeenCalledTimes(1));
  });

  it('replays system navigation only after discard confirmation', async () => {
    const { result, rerender } = renderHook(
      ({ fingerprint }: { fingerprint: string }) =>
        useJournalEntryLeaveGuard({ fingerprint, baselineReady: true }),
      { initialProps: { fingerprint: 'initial' } as { fingerprint: string } },
    );
    await waitFor(() => expect(result.current.hasBaseline).toBe(true));
    rerender({ fingerprint: 'changed' });
    await waitFor(() => expect(result.current.isDirty).toBe(true));
    const action = { type: 'GO_BACK' };

    act(() => mockPreventCallback?.({ data: { action } }));
    expect(mockDispatch).not.toHaveBeenCalled();
    act(() => latestConfirm().onConfirm());
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(action));
  });

  it('bypasses the prompt after a successful save', async () => {
    const { result, rerender } = renderHook(
      ({ fingerprint }: { fingerprint: string }) =>
        useJournalEntryLeaveGuard({ fingerprint, baselineReady: true }),
      { initialProps: { fingerprint: 'initial' } as { fingerprint: string } },
    );
    await waitFor(() => expect(result.current.hasBaseline).toBe(true));
    rerender({ fingerprint: 'changed' });
    await waitFor(() => expect(result.current.isDirty).toBe(true));

    act(() => result.current.leaveAfterSave());
    await waitFor(() => expect(AppNavigation.back).toHaveBeenCalledTimes(1));
    expect(confirm.show).not.toHaveBeenCalled();
  });
});
