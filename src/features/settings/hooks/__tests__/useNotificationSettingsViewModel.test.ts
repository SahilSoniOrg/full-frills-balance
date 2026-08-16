import { act, renderHook } from '@testing-library/react-native';
import { notificationService } from '@/src/services/notification/NotificationService';
import { useNotificationSettingsViewModel } from '../useNotificationSettingsViewModel';

jest.mock('@/src/hooks/useAiPrefs', () => ({
  useAiPrefs: () => ({
    isNativeAiEnabled: false,
    setIsNativeAiEnabled: jest.fn(),
    preferredAiModelId: undefined,
    setPreferredAiModelId: jest.fn(),
    aiInferenceMode: 'single',
    setAiInferenceMode: jest.fn(),
  }),
}));

const mockSetNotificationCadence = jest.fn();

jest.mock('@/src/hooks/useNotificationPrefs', () => ({
  useNotificationPrefs: () => ({
    notificationCadence: 'daily',
    notificationHour: 8,
    notificationMinute: 15,
    notificationWeekday: 1,
    setNotificationCadence: mockSetNotificationCadence,
    setNotificationTime: jest.fn(),
    setNotificationWeekday: jest.fn(),
  }),
}));

jest.mock('@/src/hooks/useSmsPrefs', () => ({
  useSmsPrefs: () => ({ isSmsImportEnabled: false, setIsSmsImportEnabled: jest.fn() }),
}));

jest.mock('@/src/services/ai/ModelManagementService', () => ({
  modelManagementService: { getAllModels: () => [] },
}));

jest.mock('@/src/services/analytics-service', () => ({
  analytics: {
    logNotificationPreferenceChanged: jest.fn(),
    logSmsImportSettingsChanged: jest.fn(),
    trackFeatureUsage: jest.fn(),
  },
}));

jest.mock('@/src/services/notification/NotificationService', () => ({
  notificationService: {
    requestPermissions: jest.fn(),
    scheduleReminder: jest.fn().mockResolvedValue(undefined),
    sendImmediateTest: jest.fn(),
  },
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const requestPermissions = notificationService.requestPermissions as jest.Mock;
const scheduleReminder = notificationService.scheduleReminder as jest.Mock;

describe('useNotificationSettingsViewModel notification ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    scheduleReminder.mockResolvedValue(undefined);
  });

  it('ignores an older permission result that resolves after a newer cadence request', async () => {
    const olderPermission = deferred<boolean>();
    const newerPermission = deferred<boolean>();
    requestPermissions
      .mockImplementationOnce(() => olderPermission.promise)
      .mockImplementationOnce(() => newerPermission.promise);
    const { result } = renderHook(() => useNotificationSettingsViewModel());

    let older!: Promise<void>;
    let newer!: Promise<void>;
    act(() => {
      older = result.current.onUpdateNotificationCadence('daily');
      newer = result.current.onUpdateNotificationCadence('weekly');
    });

    await act(async () => {
      newerPermission.resolve(true);
      await newer;
    });
    await act(async () => {
      olderPermission.resolve(true);
      await older;
    });

    expect(mockSetNotificationCadence).toHaveBeenCalledTimes(1);
    expect(mockSetNotificationCadence).toHaveBeenCalledWith('weekly');
    expect(scheduleReminder).toHaveBeenCalledTimes(1);
    expect(scheduleReminder).toHaveBeenCalledWith('weekly', 8, 15, 1);
  });
});
