import { useJournalDetailsActions } from '@/src/features/journal/hooks/useJournalDetailsActions';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import { JournalId, WorkplaceId } from '@/src/types/domain';
import { confirm } from '@/src/utils/alerts';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@/src/contexts/PrivacyScope', () => ({
  useEffectivePrivacyMode: () => false,
}));
jest.mock('@/src/features/journal/hooks/useJournalActions', () => ({
  useJournalActions: () => ({
    deleteJournal: jest.fn(),
    findJournal: jest.fn(),
    duplicateJournal: jest.fn(),
    postJournal: jest.fn(),
    revertToPlanned: jest.fn(),
  }),
}));
jest.mock('@/src/services/planned-payment/plannedPaymentReadService', () => ({
  plannedPaymentReadService: { find: jest.fn() },
}));
jest.mock('@/src/services/PlannedPaymentService', () => ({
  plannedPaymentService: { skipOccurrence: jest.fn() },
}));
jest.mock('@/src/utils/alerts', () => ({
  confirm: { show: jest.fn() },
  showConfirmationAlert: jest.fn(),
  showErrorAlert: jest.fn(),
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { back: jest.fn(), toJournalEntry: jest.fn() },
}));

describe('useJournalDetailsActions orphan prompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prompts delete vs post when a planned journal has no planned payment', async () => {
    (plannedPaymentReadService.find as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() =>
      useJournalDetailsActions({
        workplaceId: 'wp-1' as WorkplaceId,
        journalId: 'j-orphan' as JournalId,
        amount: 1200,
        currencyCode: 'USD',
        status: 'PLANNED',
        plannedPaymentId: 'pp-gone',
        journalDate: 1,
      }),
    );

    await act(async () => {
      await result.current.promptOrphanIfNeeded();
    });

    expect(confirm.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Planned payment was deleted',
        confirmText: 'Delete journal',
        cancelText: 'Post anyway',
        destructive: true,
      }),
    );
  });

  it('does not prompt when the planned payment still exists', async () => {
    (plannedPaymentReadService.find as jest.Mock).mockResolvedValue({ id: 'pp-live' });

    const { result } = renderHook(() =>
      useJournalDetailsActions({
        workplaceId: 'wp-1' as WorkplaceId,
        journalId: 'j-ok' as JournalId,
        amount: 50,
        currencyCode: 'USD',
        status: 'PLANNED',
        plannedPaymentId: 'pp-live',
        journalDate: 1,
      }),
    );

    await act(async () => {
      await result.current.promptOrphanIfNeeded();
    });

    expect(confirm.show).not.toHaveBeenCalled();
  });
});
