import { renderHook } from '@testing-library/react-native';
import { analytics } from '@/src/services/analytics';
import { serializeNotFoundParams, useNotFoundTracking } from '../useNotFoundTracking';

jest.mock('@/src/services/analytics', () => ({ analytics: { track: jest.fn() } }));

let mockPathname = '/this-page-does-not-exist';
let mockParams: Record<string, string | string[]> = {};

jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useGlobalSearchParams: () => mockParams,
}));

const mockTrack = analytics.track as jest.Mock;

describe('useNotFoundTracking', () => {
  beforeEach(() => {
    mockTrack.mockClear();
    mockPathname = '/this-page-does-not-exist';
    mockParams = {};
  });

  it('serializes scalar and repeated params in URL order', () => {
    expect(
      serializeNotFoundParams({
        source: 'email',
        retry: '1',
        tag: ['a', 'b'],
        ignored: undefined,
      }),
    ).toBe('source=email&retry=1&tag=a&tag=b');
  });

  it('tracks one not_found event with the URL and its query params', () => {
    mockParams = { source: 'email', retry: '1' };

    const { rerender } = renderHook(() => useNotFoundTracking());
    rerender({});

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('not_found', {
      url: '/this-page-does-not-exist?source=email&retry=1',
      params: 'source=email&retry=1',
    });
  });

  it('tracks the bare pathname when there are no query params', () => {
    renderHook(() => useNotFoundTracking());

    expect(mockTrack).toHaveBeenCalledWith('not_found', {
      url: '/this-page-does-not-exist',
      params: '',
    });
  });
});
