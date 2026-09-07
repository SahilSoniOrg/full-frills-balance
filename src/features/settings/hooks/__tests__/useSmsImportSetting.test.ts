import { act, renderHook } from '@testing-library/react-native';
import { analytics } from '@/src/services/analytics';
import { useSmsImportSetting } from '../useSmsImportSetting';

const mockSetIsSmsImportEnabled = jest.fn();

jest.mock('@/src/hooks/useSmsPrefs', () => ({
  useSmsPrefs: () => ({
    isSmsImportEnabled: false,
    setIsSmsImportEnabled: mockSetIsSmsImportEnabled,
  }),
}));

jest.mock('@/src/services/analytics', () => ({
  analytics: {
    logSmsImportSettingsChanged: jest.fn(),
    trackFeatureUsage: jest.fn(),
  },
}));

const mockLogSmsImportSettingsChanged = analytics.logSmsImportSettingsChanged as jest.Mock;
const mockTrackFeatureUsage = analytics.trackFeatureUsage as jest.Mock;

describe('useSmsImportSetting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists the toggle and records the existing analytics events', () => {
    const { result } = renderHook(() => useSmsImportSetting());

    act(() => result.current.setIsSmsImportEnabled(true));

    expect(mockSetIsSmsImportEnabled).toHaveBeenCalledWith(true);
    expect(mockLogSmsImportSettingsChanged).toHaveBeenCalledWith(true);
    expect(mockTrackFeatureUsage).toHaveBeenCalledWith('settings', 'toggle_sms_import', {
      enabled: true,
    });
  });
});
