import type { WorkplaceId } from '@/src/types/ids';
import { preferences } from '@/src/services/preferences';
import { readAvailableUpdate } from '../updateAvailabilityStore';
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

jest.mock('../updateAvailabilityStore', () => ({
  readAvailableUpdate: jest.fn(),
  subscribeToAvailableUpdate: jest.fn(),
}));

const mockedReadAvailableUpdate = jest.mocked(readAvailableUpdate);
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
    mockedReadAvailableUpdate.mockReturnValue({ policy, dismissed: true });
    mockedDismissedPatternIds.mockReturnValue([]);
    jest.clearAllMocks();
    mockedReadAvailableUpdate.mockReturnValue({ policy, dismissed: true });
    mockedDismissedPatternIds.mockReturnValue([]);
  });

  it('exposes a dismissed available update as a Hub insight', () => {
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

    expect(updateInsightService.observe('workplace-2' as WorkplaceId, false)).toEqual([]);
    expect(updateInsightService.observe('workplace-2' as WorkplaceId, true)).toHaveLength(1);
  });

  it('does not expose the update before the toast is dismissed', () => {
    mockedReadAvailableUpdate.mockReturnValue({ policy, dismissed: false });

    expect(updateInsightService.observe('workplace-3' as WorkplaceId, false)).toEqual([]);
  });

  it('delegates dismissal and restore to workplace preferences', () => {
    const workplaceId = 'workplace-4' as WorkplaceId;

    updateInsightService.dismiss(workplaceId, 'app-update-12');
    updateInsightService.restore(workplaceId, 'app-update-12');

    expect(mockedDismissPattern).toHaveBeenCalledWith(workplaceId, 'app-update-12');
    expect(mockedUndismissPattern).toHaveBeenCalledWith(workplaceId, 'app-update-12');
  });
});
