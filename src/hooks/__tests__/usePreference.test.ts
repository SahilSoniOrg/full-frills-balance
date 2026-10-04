import { act, renderHook } from '@testing-library/react-native';
import { preferences } from '@/src/services/preferences';
import { usePreference } from '../usePreference';

const snapshot = { reportsV2Enabled: false };

jest.mock('@/src/services/preferences', () => ({
  preferences: {
    observe: jest.fn(() => ({ subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })) })),
    getSnapshot: jest.fn(() => snapshot),
    update: jest.fn(),
  },
}));

describe('usePreference', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads and updates a preference through the shared facade API', () => {
    const { result } = renderHook(() => usePreference('reportsV2Enabled'));

    expect(result.current.value).toBe(false);
    act(() => result.current.setValue(true));

    expect(preferences.observe).toHaveBeenCalledWith('reportsV2Enabled');
    expect(preferences.update).toHaveBeenCalledWith({ reportsV2Enabled: true });
  });
});
