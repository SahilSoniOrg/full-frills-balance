import { act, renderHook } from '@testing-library/react-native';
import { analytics } from '@/src/services/analytics';
import { useProfilePrefs } from '@/src/hooks/useProfilePrefs';
import { usePersonalizationViewModel } from '../usePersonalizationViewModel';

jest.mock('@/src/hooks/useProfilePrefs', () => ({
  useProfilePrefs: jest.fn(),
}));

jest.mock('@/src/services/analytics', () => ({
  analytics: {
    trackFeatureUsage: jest.fn(),
  },
}));

const mockUseProfilePrefs = useProfilePrefs as jest.Mock;
const mockPersistUserName = jest.fn();
const mockTrackFeatureUsage = analytics.trackFeatureUsage as jest.Mock;

let currentUserName = 'Alice';

describe('usePersonalizationViewModel', () => {
  beforeEach(() => {
    currentUserName = 'Alice';
    mockPersistUserName.mockReset();
    mockTrackFeatureUsage.mockReset();
    mockUseProfilePrefs.mockImplementation(() => ({
      userName: currentUserName,
      setUserName: mockPersistUserName,
    }));
  });

  it('follows external name changes while the draft is clean', () => {
    const { result, rerender } = renderHook(() => usePersonalizationViewModel());

    expect(result.current.draftName).toBe('Alice');

    currentUserName = 'Remote';
    rerender(undefined);

    expect(result.current.draftName).toBe('Remote');
  });

  it('preserves an active edit across an external name change', () => {
    const { result, rerender } = renderHook(() => usePersonalizationViewModel());

    act(() => result.current.setDraftName('Local edit'));
    currentUserName = 'Remote';
    rerender(undefined);

    expect(result.current.draftName).toBe('Local edit');
  });

  it('trims and persists a changed name once', () => {
    const { result } = renderHook(() => usePersonalizationViewModel());

    act(() => result.current.setDraftName('  New name  '));
    act(() => result.current.commitName());

    expect(mockPersistUserName).toHaveBeenCalledTimes(1);
    expect(mockPersistUserName).toHaveBeenCalledWith('New name');
    expect(mockTrackFeatureUsage).toHaveBeenCalledWith('settings', 'change_name', {
      name_length: 8,
    });
    expect(result.current.draftName).toBe('New name');
  });

  it('restores the persisted value for whitespace-only input', () => {
    const { result } = renderHook(() => usePersonalizationViewModel());

    act(() => result.current.setDraftName('   '));
    act(() => result.current.commitName());

    expect(mockPersistUserName).not.toHaveBeenCalled();
    expect(result.current.draftName).toBe('Alice');
  });
});
