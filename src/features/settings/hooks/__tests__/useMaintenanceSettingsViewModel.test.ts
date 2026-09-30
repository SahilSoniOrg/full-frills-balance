import { act, renderHook } from '@testing-library/react-native';
import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { analytics } from '@/src/services/analytics';
import { journalBalanceInsightService, resetDatabase } from '@/src/services/integrity';
import { alert, confirm } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useMaintenanceSettingsViewModel } from '../useMaintenanceSettingsViewModel';

jest.mock('@/src/contexts/app-shell/AppRestartProvider', () => ({
  useAppRestart: jest.fn(),
}));

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: jest.fn(),
}));

jest.mock('@/src/services/analytics', () => ({
  analytics: {
    logEntrypointSelected: jest.fn(),
    logFactoryReset: jest.fn(),
    trackFeatureUsage: jest.fn(),
  },
}));

jest.mock('@/src/services/integrity', () => ({
  forceRunCheck: jest.fn(),
  journalBalanceInsightService: { refresh: jest.fn() },
  cleanupDatabase: jest.fn(),
  resetDatabase: jest.fn(),
}));

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { toJournalBalanceReview: jest.fn() },
}));

jest.mock('@/src/utils/alerts', () => ({
  alert: { show: jest.fn() },
  confirm: { show: jest.fn() },
  toast: { error: jest.fn(), warning: jest.fn() },
}));

const mockUseAppRestart = useAppRestart as jest.Mock;
const mockUseWorkplace = useWorkplace as jest.Mock;
const mockRequireRestart = jest.fn();
const mockConfirmShow = confirm.show as jest.Mock;
const mockResetDatabase = resetDatabase as jest.Mock;
const mockLogFactoryReset = analytics.logFactoryReset as jest.Mock;

describe('useMaintenanceSettingsViewModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppRestart.mockReturnValue({ requireRestart: mockRequireRestart });
    mockUseWorkplace.mockReturnValue({ workplaceId: 'workplace-1' });
    mockResetDatabase.mockResolvedValue({ status: 'committed', warnings: [] });
  });

  it('resets the database before requesting an app restart', async () => {
    const { result } = renderHook(() => useMaintenanceSettingsViewModel());

    await act(async () => {
      result.current.onFactoryReset();
    });
    const { onConfirm } = mockConfirmShow.mock.calls[0][0];

    await act(async () => {
      await onConfirm();
    });

    expect(mockLogFactoryReset).toHaveBeenCalledTimes(1);
    expect(mockResetDatabase).toHaveBeenCalledTimes(1);
    expect(mockRequireRestart).toHaveBeenCalledWith({ type: 'RESET' });
    expect(mockResetDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      mockRequireRestart.mock.invocationCallOrder[0],
    );
  });

  it('opens the balance review when the user reviews unbalanced journals', async () => {
    (journalBalanceInsightService.refresh as jest.Mock).mockResolvedValue({
      journalsChecked: 3,
      unbalanced: [
        { journalId: 'journal-a', details: 'differ' },
        { journalId: 'journal-b', details: 'differ' },
      ],
    });
    const { result } = renderHook(() => useMaintenanceSettingsViewModel());

    await act(async () => {
      await result.current.onAuditJournalBalances();
    });

    expect(journalBalanceInsightService.refresh).toHaveBeenCalledWith('workplace-1', 'maintenance');
    const { message, onConfirm } = mockConfirmShow.mock.calls[0][0];
    expect(message).toMatch(/2 of 3 posted entries/);
    onConfirm();
    expect(AppNavigation.toJournalBalanceReview).toHaveBeenCalled();
    expect(analytics.logEntrypointSelected).toHaveBeenCalledWith(
      'settings_maintenance',
      'balance_audit',
      'journal_balance_review',
    );
    expect(result.current.isAuditingBalances).toBe(false);
  });

  it('confirms when every journal balances', async () => {
    (journalBalanceInsightService.refresh as jest.Mock).mockResolvedValue({
      journalsChecked: 4,
      unbalanced: [],
    });
    const { result } = renderHook(() => useMaintenanceSettingsViewModel());

    await act(async () => {
      await result.current.onAuditJournalBalances();
    });

    expect(alert.show).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'All Entries Balance' }),
    );
    expect(mockConfirmShow).not.toHaveBeenCalled();
  });
});
