import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { useWidgetSync } from '@/src/features/app/hooks/useWidgetSync';
import { loadNativeWidgetAdapter } from '@/src/services/widgets/nativeWidgetAdapter';
import { usePrivacyPrefs } from '@/src/hooks/usePrivacyPrefs';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservable } from '@/src/hooks/useObservable';
import { asWorkplaceId, WorkplaceId } from '@/src/types/ids';
import { act, renderHook } from '@testing-library/react-native';
import expoWidgetsModule from '@/modules/expo-widgets';

jest.mock('@/src/contexts/app-shell/AppLockProvider', () => ({
  useAppLock: jest.fn(),
}));
jest.mock('@/src/contexts/app-shell/appReady', () => ({
  useAppReady: jest.fn(),
}));
jest.mock('@/src/hooks/usePrivacyPrefs', () => ({ usePrivacyPrefs: jest.fn() }));
jest.mock('@/src/hooks/useThemePrefs', () => ({ useThemePrefs: jest.fn() }));
jest.mock('@/src/hooks/use-theme', () => ({ useTheme: jest.fn() }));
jest.mock('@/src/hooks/useObservable', () => ({ useObservable: jest.fn() }));
jest.mock('@/src/services/widgets/nativeWidgetAdapter', () =>
  require('@/src/testing/mockNativeWidgets').nativeWidgetAdapterModuleMock(),
);
jest.mock('@/modules/expo-widgets', () => ({
  __esModule: true,
  default: { syncWidgetData: jest.fn() },
}));
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: {
    OS: 'android',
    Version: '30',
    select: (items: Record<string, unknown>) => items.android ?? items.default,
  },
}));

const mockSyncWidgetData = expoWidgetsModule.syncWidgetData as jest.Mock;

describe('useWidgetSync generation ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (useAppLock as jest.Mock).mockReturnValue({ isAppCurrentlyLocked: false });
    (useAppReady as jest.Mock).mockReturnValue({ isAppReady: true });
    (usePrivacyPrefs as jest.Mock).mockReturnValue({ isWidgetPrivacyEnabled: false });
    (useThemePrefs as jest.Mock).mockReturnValue({ themeId: 'default' });
    (useTheme as jest.Mock).mockReturnValue({
      themeMode: 'light',
      theme: {
        expense: '#CC0000',
        income: '#00AA00',
        primary: '#112233',
        primaryLight: '#445566',
        pure: '#FFFFFF',
        surface: '#EEEEEE',
        text: '#111111',
        textSecondary: '#666666',
        transfer: '#0000CC',
      },
    });
    (useObservable as jest.Mock).mockImplementation(
      (_factory: unknown, dependencies: [WorkplaceId]) => ({
        data: {
          quality: 'ready',
          workplaceId: dependencies[0],
          asOf: 1_759_200_000_000,
          generatedAt: 1_759_200_000_100,
          horizonDays: 60,
          currencyCode: dependencies[0] === 'workplace-a' ? 'USD' : 'EUR',
          firstMajorInflowDay: null,
          safeToSpend: dependencies[0] === 'workplace-a' ? 100 : 200,
          shortfall: 0,
          trajectoryMinBalance: 0,
        },
      }),
    );
    (loadNativeWidgetAdapter as jest.Mock).mockResolvedValue(expoWidgetsModule);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('drops an A snapshot when its lazy module load resolves after switching to B', async () => {
    let resolveWorkplaceALoad!: (module: typeof expoWidgetsModule) => void;
    const workplaceALoad = new Promise<typeof expoWidgetsModule>(resolve => {
      resolveWorkplaceALoad = resolve;
    });
    (loadNativeWidgetAdapter as jest.Mock)
      .mockImplementationOnce(() => workplaceALoad)
      .mockResolvedValue(expoWidgetsModule);

    const { rerender } = renderHook<void, { workplaceId: WorkplaceId }>(
      ({ workplaceId }) =>
        useWidgetSync(workplaceId, workplaceId === 'workplace-b' ? 'EUR' : 'USD'),
      {
        initialProps: { workplaceId: 'workplace-a' as WorkplaceId },
      },
    );

    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    rerender({ workplaceId: 'workplace-b' as WorkplaceId });
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });

    resolveWorkplaceALoad(expoWidgetsModule);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSyncWidgetData).toHaveBeenCalledTimes(1);
    expect(mockSyncWidgetData.mock.calls[0][0].safeToSpend).toMatchObject({
      amount: 200,
      currencyCode: 'EUR',
      updatedAt: 1_759_200_000_100,
    });
  });

  it('does not publish a ready amount owned by another workplace/currency', async () => {
    (useObservable as jest.Mock).mockReturnValue({
      data: {
        quality: 'ready',
        workplaceId: 'workplace-a',
        currencyCode: 'USD',
        asOf: 1_759_200_000_000,
        generatedAt: 1_759_200_000_100,
        horizonDays: 60,
        safeToSpend: 300,
        shortfall: 0,
        trajectoryMinBalance: 300,
        firstMajorInflowDay: null,
      },
    });
    renderHook(() => useWidgetSync('workplace-b' as WorkplaceId, 'EUR'));
    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockSyncWidgetData.mock.calls.at(-1)?.[0].safeToSpend).toBeUndefined();
  });
});

describe('useWidgetSync availability', () => {
  const readyHeadline = {
    quality: 'ready' as const,
    workplaceId: asWorkplaceId('widget-test'),
    asOf: 1_759_200_000_000,
    generatedAt: 1_759_200_000_100,
    horizonDays: 60,
    currencyCode: 'USD',
    safeToSpend: 250,
    shortfall: 0,
    trajectoryMinBalance: 250,
    firstMajorInflowDay: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (useAppLock as jest.Mock).mockReturnValue({ isAppCurrentlyLocked: false });
    (useAppReady as jest.Mock).mockReturnValue({ isAppReady: true });
    (usePrivacyPrefs as jest.Mock).mockReturnValue({ isWidgetPrivacyEnabled: false });
    (useThemePrefs as jest.Mock).mockReturnValue({ themeId: 'test-theme' });
    (useTheme as jest.Mock).mockReturnValue({
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
    });
    (loadNativeWidgetAdapter as jest.Mock).mockResolvedValue(expoWidgetsModule);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['unavailable', 'stale'] as const)(
    'clears the widget value when a projection becomes %s',
    async quality => {
      (useObservable as jest.Mock).mockImplementation(() => ({ data: readyHeadline }));
      const { rerender } = renderHook(() => useWidgetSync(asWorkplaceId('widget-test'), 'USD'));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(600);
      });
      expect(mockSyncWidgetData.mock.calls.at(-1)?.[0].safeToSpend.amount).toBe(250);

      (useObservable as jest.Mock).mockImplementation(() => ({
        data: { ...readyHeadline, quality, safeToSpend: 0, trajectoryMinBalance: 0 },
      }));
      rerender({});
      await act(async () => {
        await jest.advanceTimersByTimeAsync(600);
      });
      expect(mockSyncWidgetData.mock.calls.at(-1)?.[0].safeToSpend).toBeUndefined();
    },
  );
});
