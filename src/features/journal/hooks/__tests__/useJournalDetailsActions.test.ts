import { renderHook, act } from '@testing-library/react-native';

import { useJournalDetailsActions } from '../useJournalDetailsActions';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { showConfirmationAlert } from '@/src/utils/alerts';

jest.mock('@/src/features/journal/hooks/useJournalActions', () => ({
  useJournalActions: jest.fn(),
}));

jest.mock('@/src/contexts/PrivacyScope', () => ({
  useEffectivePrivacyMode: () => false,
}));

jest.mock('@/src/utils/alerts', () => ({
  showConfirmationAlert: jest.fn(),
  showErrorAlert: jest.fn(),
  toast: { success: jest.fn() },
}));

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    back: jest.fn(),
    toJournalEntry: jest.fn(),
  },
}));

describe('useJournalDetailsActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useJournalActions as jest.Mock).mockReturnValue({
      deleteJournal: jest.fn(),
      postJournal: jest.fn(),
      revertToPlanned: jest.fn(),
    });
  });

  it('opens the journal copy flow with the original journal id', () => {
    const { result } = renderHook(() =>
      useJournalDetailsActions({
        workplaceId: 'wp-1' as WorkplaceId,
        journalId: 'journal-1' as JournalId,
        amount: 12.34,
        currencyCode: 'USD',
        status: 'POSTED',
        journalDate: Date.parse('2026-08-25T12:30:00.000Z'),
      }),
    );

    act(() => {
      result.current.handleCopy();
    });

    expect(AppNavigation.toJournalEntry).toHaveBeenCalledWith({
      params: { copyJournalId: 'journal-1' },
    });
  });

  it('marks a confirmed post as pending and ignores a second confirmation until it finishes', async () => {
    let finishPost!: () => void;
    const postJournal = jest.fn(
      () =>
        new Promise<void>(resolve => {
          finishPost = resolve;
        }),
    );
    (useJournalActions as jest.Mock).mockReturnValue({
      deleteJournal: jest.fn(),
      postJournal,
      revertToPlanned: jest.fn(),
    });
    const { result } = renderHook(() =>
      useJournalDetailsActions({
        workplaceId: 'wp-1' as WorkplaceId,
        journalId: 'journal-1' as JournalId,
        amount: 12.34,
        currencyCode: 'USD',
        status: 'PLANNED',
      }),
    );

    act(() => {
      void result.current.handlePost();
      void result.current.handlePost();
    });
    const [first, second] = (showConfirmationAlert as jest.Mock).mock.calls.map(call => call[2]);
    act(() => {
      first();
      second();
    });

    expect(result.current.pendingAction).toBe('post');
    expect(postJournal).toHaveBeenCalledTimes(1);
    await act(async () => finishPost());
    expect(result.current.pendingAction).toBeNull();
    expect(AppNavigation.back).toHaveBeenCalledTimes(1);
  });
});
