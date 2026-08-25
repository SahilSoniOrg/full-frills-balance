import { renderHook, act } from '@testing-library/react-native';

import { useJournalDetailsActions } from '../useJournalDetailsActions';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';

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
  const duplicateJournal = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    duplicateJournal.mockResolvedValue({ id: 'copied-journal' });
    (useJournalActions as jest.Mock).mockReturnValue({
      deleteJournal: jest.fn(),
      duplicateJournal,
      postJournal: jest.fn(),
      revertToPlanned: jest.fn(),
    });
  });

  it('opens the duplicated journal in the editor with copy context', async () => {
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

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(duplicateJournal).toHaveBeenCalledWith('journal-1');
    expect(AppNavigation.toJournalEntry).toHaveBeenCalledWith({
      journalId: 'copied-journal',
      initialDate: '2026-08-25T12:30:00.000Z',
      amount: '12.34',
    });
  });
});
