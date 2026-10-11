import type { WorkplaceId } from '@/src/types/ids';
import { preferences } from '@/src/services/preferences';
import { storage } from '@/src/utils/storage';
import { getCurrentBuild } from '../versionPolicyService';
import { updateInsightService } from '../updateInsightService';

jest.mock('../versionPolicyService', () => ({ getCurrentBuild: jest.fn(() => 11) }));

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
    storage.remove('full_frills_balance_update_notice_dismissed_v2');
    jest.mocked(getCurrentBuild).mockReturnValue(11);
    updateInsightService.clearAvailableUpdate();
    mockedDismissedPatternIds.mockReturnValue([]);
  });

  it('exposes an available update immediately as a Hub insight', () => {
    updateInsightService.publishAvailableUpdate(policy);
    const insights = updateInsightService.observe('workplace-1' as WorkplaceId, false);

    expect(insights).toEqual([
      expect.objectContaining({
        id: 'app-update-11-12-available',
        type: 'app-update',
        message: 'Please update.',
        description: 'Installed build 11. Available build 12.',
        storeUrl: policy.storeUrl,
      }),
    ]);
  });

  it('keeps the update in the dismissed tab after the user dismisses it', () => {
    mockedDismissedPatternIds.mockReturnValue(['app-update-11-12-available']);
    updateInsightService.publishAvailableUpdate(policy);

    expect(updateInsightService.observe('workplace-2' as WorkplaceId, false)).toEqual([]);
    expect(updateInsightService.observe('workplace-2' as WorkplaceId, true)).toHaveLength(1);
  });

  it('keeps Hub independent of toast dismissal', () => {
    updateInsightService.publishAvailableUpdate(policy);

    const insights = updateInsightService.observe('workplace-3' as WorkplaceId, false);
    expect(insights).toHaveLength(1);
    updateInsightService.dismissAvailableUpdate(policy);
    expect(updateInsightService.observe('workplace-3' as WorkplaceId, false)).toEqual(insights);
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

  it('does not let an old toast restore a withdrawn update or replace a newer one', () => {
    updateInsightService.publishAvailableUpdate(policy);
    updateInsightService.clearAvailableUpdate();
    updateInsightService.dismissAvailableUpdate(policy);
    expect(updateInsightService.observe('workplace-1' as WorkplaceId, false)).toEqual([]);

    updateInsightService.publishAvailableUpdate({ ...policy, latestBuild: 13 });
    updateInsightService.dismissAvailableUpdate({ ...policy, latestBuild: 13 });
    updateInsightService.dismissAvailableUpdate(policy);
    expect(updateInsightService.observe('workplace-1' as WorkplaceId, false)[0].id).toBe(
      'app-update-11-13-available',
    );
    expect(updateInsightService.isNoticeDismissed({ ...policy, latestBuild: 13 })).toBe(true);
  });

  it('gives readiness its own Hub dismissal identity', () => {
    mockedDismissedPatternIds.mockReturnValue(['app-update-11-12-available']);
    updateInsightService.publishAvailableUpdate(policy);
    expect(updateInsightService.observe('workplace-1' as WorkplaceId, false)).toEqual([]);
    updateInsightService.publishAvailableUpdate(policy, true);
    updateInsightService.dismissAvailableUpdate(policy);
    expect(updateInsightService.observe('workplace-1' as WorkplaceId, false)[0]).toEqual(
      expect.objectContaining({ id: 'app-update-11-12-ready', updateReady: true }),
    );
  });

  it('scopes persisted toast and Hub dismissals to the installed and target builds', () => {
    updateInsightService.dismissAvailableUpdate(policy);
    expect(updateInsightService.isNoticeDismissed(policy)).toBe(true);
    expect(updateInsightService.isNoticeDismissed({ ...policy, latestBuild: 13 })).toBe(false);
    jest.mocked(getCurrentBuild).mockReturnValue(10);
    expect(updateInsightService.isNoticeDismissed(policy)).toBe(false);
    mockedDismissedPatternIds.mockReturnValue(['app-update-11-12-available']);
    updateInsightService.publishAvailableUpdate(policy);
    expect(updateInsightService.observe('workplace-1' as WorkplaceId, false)[0].id).toBe(
      'app-update-10-12-available',
    );
  });

  it('delegates dismissal and restore to workplace preferences', () => {
    const workplaceId = 'workplace-4' as WorkplaceId;

    updateInsightService.dismiss(workplaceId, 'app-update-11-12-available');
    updateInsightService.restore(workplaceId, 'app-update-11-12-available');

    expect(mockedDismissPattern).toHaveBeenCalledWith(workplaceId, 'app-update-11-12-available');
    expect(mockedUndismissPattern).toHaveBeenCalledWith(workplaceId, 'app-update-11-12-available');
  });
});
