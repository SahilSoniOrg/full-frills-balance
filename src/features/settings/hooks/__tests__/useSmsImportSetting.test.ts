import { act, renderHook } from '@testing-library/react-native';
import { analytics } from '@/src/services/analytics';
import { useSmsImportSetting } from '../useSmsImportSetting';
import { automaticSmsImportService } from '@/src/services/sms/AutomaticSmsImportService';
import { alert, confirm } from '@/src/utils/alerts';

jest.mock('@/src/services/sms/AutomaticSmsImportService', () => ({
  automaticSmsImportService: { setEnabledFromSettings: jest.fn().mockResolvedValue('enabled') },
}));

jest.mock('@/src/hooks/useSmsPrefs', () => ({
  useSmsPrefs: () => ({
    isAutomaticSmsImportEnabled: false,
  }),
}));

jest.mock('@/src/services/analytics', () => ({
  analytics: {
    logSmsImportSettingsChanged: jest.fn(),
    trackFeatureUsage: jest.fn(),
  },
}));
jest.mock('@/src/utils/alerts', () => ({
  alert: { show: jest.fn() },
  confirm: { show: jest.fn() },
}));

const mockLogSmsImportSettingsChanged = analytics.logSmsImportSettingsChanged as jest.Mock;
const mockTrackFeatureUsage = analytics.trackFeatureUsage as jest.Mock;
const mockAlertShow = alert.show as jest.Mock;
const mockConfirmShow = confirm.show as jest.Mock;

describe('useSmsImportSetting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests permission through the import service and records the existing analytics events', async () => {
    const { result } = renderHook(() => useSmsImportSetting());

    await act(async () => result.current.setAutomaticSmsImportEnabled(true));

    expect(automaticSmsImportService.setEnabledFromSettings).toHaveBeenCalledWith(true);
    expect(mockLogSmsImportSettingsChanged).toHaveBeenCalledWith(true);
    expect(mockTrackFeatureUsage).toHaveBeenCalledWith('settings', 'toggle_sms_import', {
      enabled: true,
    });
  });

  it('uses the app dialog for SMS permission denial feedback', async () => {
    (automaticSmsImportService.setEnabledFromSettings as jest.Mock).mockResolvedValueOnce('denied');
    const { result } = renderHook(() => useSmsImportSetting());

    await act(async () => result.current.setAutomaticSmsImportEnabled(true));

    expect(mockAlertShow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'SMS permission required', type: 'warning' }),
    );
  });

  it('uses the app confirmation dialog when Android settings are needed', async () => {
    (automaticSmsImportService.setEnabledFromSettings as jest.Mock).mockResolvedValueOnce(
      'never_ask_again',
    );
    const { result } = renderHook(() => useSmsImportSetting());

    await act(async () => result.current.setAutomaticSmsImportEnabled(true));

    expect(mockConfirmShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'SMS permission required',
        confirmText: 'Open Settings',
      }),
    );
  });
});
