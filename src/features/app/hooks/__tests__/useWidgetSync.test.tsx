import { useWidgetSync } from '@/src/features/app/hooks/useWidgetSync';
import { asWorkplaceId } from '@/src/types/ids';
import { act, renderHook } from '@testing-library/react-native';

let mockHeadline: unknown;
const mockSyncWidgetData = jest.fn().mockResolvedValue(undefined);

jest.mock('@/src/hooks/useObservable', () => ({ useObservable: () => ({ data: mockHeadline }) }));
jest.mock('@/src/contexts/app-shell/AppLockProvider', () => ({
  useAppLock: () => ({ isAppCurrentlyLocked: false }),
}));
jest.mock('@/src/contexts/app-shell/appReady', () => ({
  useAppReady: () => ({ isAppReady: true }),
}));
jest.mock('@/src/hooks/usePrivacyPrefs', () => ({
  usePrivacyPrefs: () => ({ isWidgetPrivacyEnabled: false }),
}));
jest.mock('@/src/hooks/useThemePrefs', () => ({
  useThemePrefs: () => ({ themeId: 'test-theme' }),
}));
jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    themeMode: 'dark',
    theme: {
      surface: '#111111',
      primary: '#eeeeee',
      primaryLight: '#cccccc',
      pure: '#ffffff',
      text: '#ffffff',
      textSecondary: '#bbbbbb',
      income: '#00ff00',
      expense: '#ff0000',
      transfer: '#0000ff',
    },
  }),
}));
jest.mock('@/src/services/widgets/nativeWidgetAdapter', () => ({
  loadNativeWidgetAdapter: async () => ({ syncWidgetData: mockSyncWidgetData }),
}));
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: {
    OS: 'android',
    Version: '30',
    select: (items: Record<string, unknown>) => items.android ?? items.default,
  },
}));

describe('useWidgetSync availability', () => {
  afterEach(() => {
    jest.useRealTimers();
    mockSyncWidgetData.mockClear();
    mockHeadline = undefined;
  });

  it.each(['unavailable', 'stale'] as const)(
    'clears the widget value when a projection becomes %s',
    async quality => {
      jest.useFakeTimers();
      mockHeadline = {
        quality: 'ready',
        currencyCode: 'USD',
        safeToSpend: 250,
        shortfall: 0,
        trajectoryMinBalance: 250,
        firstMajorInflowDay: null,
      };
      const { rerender } = renderHook(() => useWidgetSync(asWorkplaceId('widget-test'), 'USD'));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(600);
      });
      expect(mockSyncWidgetData.mock.calls.at(-1)?.[0].safeToSpend.amount).toBe(250);

      mockHeadline = {
        quality,
        currencyCode: 'USD',
        safeToSpend: 0,
        shortfall: 0,
        trajectoryMinBalance: 0,
        firstMajorInflowDay: null,
      };
      rerender({});
      await act(async () => {
        await jest.advanceTimersByTimeAsync(600);
      });
      expect(mockSyncWidgetData.mock.calls.at(-1)?.[0].safeToSpend).toBeUndefined();
    },
  );
});
