import { act, renderHook } from '@testing-library/react-native';
import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { analytics } from '@/src/services/analytics';
import { integrityService } from '@/src/services/integrity';
import { confirm } from '@/src/utils/alerts';
import { useMaintenanceSettingsViewModel } from '../useMaintenanceSettingsViewModel';

jest.mock('@/src/contexts/app-shell/AppRestartProvider', () => ({
  useAppRestart: jest.fn(),
}));

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: jest.fn(),
}));

jest.mock('@/src/services/analytics', () => ({
  analytics: {
    logFactoryReset: jest.fn(),
    trackFeatureUsage: jest.fn(),
  },
}));

jest.mock('@/src/services/integrity', () => ({
  integrityService: {
    forceRunCheck: jest.fn(),
    cleanupDatabase: jest.fn(),
    resetDatabase: jest.fn(),
  },
}));

jest.mock('@/src/utils/alerts', () => ({
  alert: { show: jest.fn() },
  confirm: { show: jest.fn() },
  toast: { error: jest.fn() },
}));

const mockUseAppRestart = useAppRestart as jest.Mock;
const mockUseWorkplace = useWorkplace as jest.Mock;
const mockRequireRestart = jest.fn();
const mockConfirmShow = confirm.show as jest.Mock;
const mockResetDatabase = integrityService.resetDatabase as jest.Mock;
const mockLogFactoryReset = analytics.logFactoryReset as jest.Mock;

describe('useMaintenanceSettingsViewModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppRestart.mockReturnValue({ requireRestart: mockRequireRestart });
    mockUseWorkplace.mockReturnValue({ workplaceId: 'workplace-1' });
    mockResetDatabase.mockResolvedValue(undefined);
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
});
