import { act, renderHook, waitFor } from '@/src/utils/test-utils';
import { usePlannedPaymentDetailsViewModel } from '../usePlannedPaymentDetailsViewModel';
import { usePlannedPaymentRecord } from '../usePlannedPaymentRecord';
import { plannedPaymentDetailService } from '@/src/services/planned-payment/plannedPaymentDetailService';
import {
  postPlannedJournalOccurrence,
  skipPlannedPaymentOccurrence,
} from '@/src/services/planned-payment/plannedPaymentOrchestration';
import type { PlannedPaymentObligation } from '@/src/services/planned-payment/plannedPaymentReadService';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { AccountId, PlannedPaymentId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { toast } from '@/src/utils/alerts';

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({ theme: { primary: '#000' } }),
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'workplace' }),
}));
jest.mock('@/src/contexts/PrivacyScope', () => ({
  useEffectivePrivacyMode: () => false,
}));
jest.mock('@/src/hooks/useAccounts', () => ({ useAccount: () => ({ account: null }) }));
jest.mock('@/src/hooks/useSelection', () => ({
  useSelection: () => ({
    selectedIds: new Set(),
    isSelectionModeActive: false,
    toggleSelection: jest.fn(),
    onLongPressItem: jest.fn(),
    clearItems: jest.fn(),
    exitSelectionMode: jest.fn(),
    selectAll: jest.fn(),
  }),
}));
jest.mock('@/src/features/journal', () => ({
  useJournals: () => ({
    journals: [],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    loadMore: jest.fn(),
  }),
  useJournalsBulkOperations: () => ({ actions: [], modals: {} }),
}));
jest.mock('@/src/services/audit-service', () => ({
  auditService: { observeAuditTrail: () => jest.requireActual('rxjs').of([]) },
}));
jest.mock('../usePlannedPaymentRecord', () => ({ usePlannedPaymentRecord: jest.fn() }));
jest.mock('@/src/services/planned-payment/plannedPaymentDetailService', () => ({
  plannedPaymentDetailService: { observeActivity: jest.fn(() => jest.requireActual('rxjs').of([])) },
  summarizePlannedPaymentActivity: jest.fn(),
  getNextPlannedPaymentOccurrences: jest.fn(() => []),
}));
jest.mock('@/src/services/planned-payment/plannedPaymentOrchestration', () => ({
  postPlannedJournalOccurrence: jest.fn(),
  postPlannedPaymentOccurrence: jest.fn(),
  skipPlannedPaymentOccurrence: jest.fn(),
}));
jest.mock('@/src/services/planned-payment/plannedPaymentLifecycle', () => ({
  togglePlannedPaymentStatus: jest.fn(),
}));
jest.mock('@/src/services/planned-payment/plannedPaymentCommands', () => ({
  deletePlannedPayment: jest.fn(),
}));
jest.mock('@/src/services/analytics', () => ({ analytics: { trackFeatureUsage: jest.fn() } }));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { back: jest.fn(), toPlannedPaymentForm: jest.fn() },
}));
jest.mock('@/src/services/planned-payment/plannedPaymentFxReviewRequest', () => ({
  withPlannedPaymentFxReview: async (run: (review?: unknown) => Promise<unknown>) => {
    await run();
    return true;
  },
}));
jest.mock('@/src/utils/alerts', () => ({ toast: { success: jest.fn() }, confirm: { show: jest.fn() } }));

const item: PlannedPaymentObligation = {
  id: 'plan' as PlannedPaymentId,
  name: 'Rent',
  amount: 100,
  currencyCode: 'USD',
  fromAccountId: 'cash' as AccountId,
  toAccountId: 'housing' as AccountId,
  intervalType: PlannedPaymentInterval.MONTHLY,
  intervalN: 1,
  startDate: 1,
  nextOccurrence: 200,
  nextDueOccurrence: 100,
  outstandingJournalId: 'unpaid',
  status: PlannedPaymentStatus.ACTIVE,
  isAutoPost: false,
  flowDirection: 'outflow',
};

describe('planned payment detail actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(usePlannedPaymentRecord).mockReturnValue({ item, isLoading: false });
    jest
      .mocked(plannedPaymentDetailService.observeActivity)
      .mockReturnValue(jest.requireActual('rxjs').of([]));
    jest.mocked(postPlannedJournalOccurrence).mockResolvedValue(undefined);
    jest.mocked(skipPlannedPaymentOccurrence).mockResolvedValue(undefined);
  });

  it('locks concurrent actions and keeps the page open after recording', async () => {
    let finish!: () => void;
    jest.mocked(postPlannedJournalOccurrence).mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => usePlannedPaymentDetailsViewModel(item.id));
    await waitFor(() => expect(result.current.isLoadingActivity).toBe(false));
    let recording!: Promise<void>;
    act(() => {
      recording = result.current.handlePostNow!();
      void result.current.handleSkip!();
    });
    expect(result.current.pendingAction).toBe('record');
    expect(skipPlannedPaymentOccurrence).not.toHaveBeenCalled();
    expect(postPlannedJournalOccurrence).toHaveBeenCalledWith('workplace', 'plan', 'unpaid', 100);
    await act(async () => {
      finish();
      await recording;
    });
    expect(result.current.pendingAction).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Occurrence recorded');
    expect(AppNavigation.back).not.toHaveBeenCalled();
  });

  it('surfaces a settlement failure and permits retry instead of silently leaving the user stuck', async () => {
    jest.mocked(postPlannedJournalOccurrence).mockRejectedValueOnce(new Error('write failed'));
    const { result } = renderHook(() => usePlannedPaymentDetailsViewModel(item.id));
    await act(async () => {
      await result.current.handlePostNow!();
    });
    expect(result.current.actionError).toBe('Could not record this occurrence. Try again.');
    expect(result.current.pendingAction).toBeNull();
    await act(async () => {
      await result.current.handlePostNow!();
    });
    expect(result.current.actionError).toBeNull();
    expect(postPlannedJournalOccurrence).toHaveBeenCalledTimes(2);
  });
});
