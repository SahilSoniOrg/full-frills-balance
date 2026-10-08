import type { WorkplaceId } from '@/src/types/ids';
import { preferences } from '@/src/services/preferences';
import { storage } from '@/src/utils/storage';
import { updateInsightService } from '../updateInsightService';

jest.mock('@/src/services/preferences', () => ({
  preferences: {
    insights: {
      dismissedPatternIds: jest.fn(() => []),
      dismissPattern: jest.fn(),
      undismissPattern: jest.fn(),
    },
  },
}));

jest.mock('@/src/utils/storage', () => {
  const values = new Map<string, string>();
  return {
    storage: {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
      remove: (key: string) => values.delete(key),
    },
  };
});

const mockedDismissedPatternIds = jest.mocked(preferences.insights.dismissedPatternIds);
const mockedDismissPattern = jest.mocked(preferences.insights.dismissPattern);
const mockedUndismissPattern = jest.mocked(preferences.insights.undismissPattern);

const policy = {
  minimumBuild: 10,
  latestBuild: 12,
  storeUrl: 'https://example.com/update',
  availableMessage: 'Please update.',
};

describe('updateInsightService', () => {
  beforeEach(() => {
    mockedDismissedPatternIds.mockReturnValue([]);
    jest.clearAllMocks();
    storage.remove('full_frills_balance_update_notice_dismissed_v1');
    updateInsightService.clearAvailableUpdate();
    mockedDismissedPatternIds.mockReturnValue([]);
  });

  it('exposes a dismissed available update as a Hub insight', () => {
    updateInsightService.dismissAvailableUpdate(policy);
    const insights = updateInsightService.observe('workplace-1' as WorkplaceId, false);

    expect(insights).toEqual([
      expect.objectContaining({
        id: 'app-update-12',
        type: 'app-update',
        message: 'Please update.',
        storeUrl: policy.storeUrl,
      }),
    ]);
  });

  it('keeps the update in the dismissed tab after the user dismisses it', () => {
    mockedDismissedPatternIds.mockReturnValue(['app-update-12']);
    updateInsightService.dismissAvailableUpdate(policy);

    expect(updateInsightService.observe('workplace-2' as WorkplaceId, false)).toEqual([]);
    expect(updateInsightService.observe('workplace-2' as WorkplaceId, true)).toHaveLength(1);
  });

  it('does not expose the update before the toast is dismissed', () => {
    updateInsightService.publishAvailableUpdate(policy);

    expect(updateInsightService.observe('workplace-3' as WorkplaceId, false)).toEqual([]);
  });

  it('preserves availability dismissal across publishing and treats readiness as a new notice', () => {
    const workplaceId = 'workplace-ready' as WorkplaceId;
    updateInsightService.dismissAvailableUpdate(policy);
    updateInsightService.publishAvailableUpdate(policy);
    expect(updateInsightService.isNoticeDismissed(policy)).toBe(true);
    const before = updateInsightService.observe(workplaceId, false);
    updateInsightService.publishAvailableUpdate(policy, true);
    expect(updateInsightService.isNoticeDismissed(policy, true)).toBe(false);
    updateInsightService.dismissAvailableUpdate(policy, true);
    const ready = updateInsightService.observe(workplaceId, false);
    expect(ready[0].updateReady).toBe(true);
    expect(ready[0].message).not.toBe(before[0].message);
    expect(updateInsightService.isNoticeDismissed({ ...policy, latestBuild: 13 }, true)).toBe(
      false,
    );
  });

  it('delegates dismissal and restore to workplace preferences', () => {
    const workplaceId = 'workplace-4' as WorkplaceId;

    updateInsightService.dismiss(workplaceId, 'app-update-12');
    updateInsightService.restore(workplaceId, 'app-update-12');

    expect(mockedDismissPattern).toHaveBeenCalledWith(workplaceId, 'app-update-12');
    expect(mockedUndismissPattern).toHaveBeenCalledWith(workplaceId, 'app-update-12');
  });
});
