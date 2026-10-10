import { renderHook } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { analytics } from '@/src/services/analytics';
import { useAboutSupportViewModel } from '../useAboutSupportViewModel';

jest.mock('@/src/services/analytics', () => ({
  analytics: {
    trackFeatureUsage: jest.fn(),
  },
}));

jest.mock('@/src/services/BugReportService', () => ({
  BugReportService: { shareReport: jest.fn(), saveReport: jest.fn() },
}));

const mockTrackFeatureUsage = analytics.trackFeatureUsage as jest.Mock;

describe('useAboutSupportViewModel', () => {
  beforeEach(() => {
    mockTrackFeatureUsage.mockReset();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  it('tracks release notes separately from the Telegram group', () => {
    const { result } = renderHook(() => useAboutSupportViewModel());

    result.current.onOpenTelegram();
    result.current.onOpenReleaseNotes();

    expect(mockTrackFeatureUsage.mock.calls).toEqual([
      ['settings', 'open_telegram'],
      ['settings', 'open_release_notes'],
    ]);
  });
});
