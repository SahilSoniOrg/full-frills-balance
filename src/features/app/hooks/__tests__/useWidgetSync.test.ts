import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { useAppReady } from '@/src/contexts/app-shell/AppReadyProvider';
import { useWidgetSync } from '@/src/features/app/hooks/useWidgetSync';
import { loadWidgetModule } from '@/src/features/app/hooks/loadWidgetModule';
import { usePrivacyPrefs } from '@/src/hooks/usePrivacyPrefs';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservable } from '@/src/hooks/useObservable';
import { WorkplaceId } from '@/src/types/ids';
import { act, renderHook } from '@testing-library/react-native';
import expoWidgetsModule from '@/modules/expo-widgets';

jest.mock('@/src/contexts/app-shell/AppLockProvider', () => ({
  useAppLock: jest.fn(),
}));
jest.mock('@/src/contexts/app-shell/AppReadyProvider', () => ({
  useAppReady: jest.fn(),
}));
jest.mock('@/src/hooks/usePrivacyPrefs', () => ({ usePrivacyPrefs: jest.fn() }));
jest.mock('@/src/hooks/useThemePrefs', () => ({ useThemePrefs: jest.fn() }));
jest.mock('@/src/hooks/use-theme', () => ({ useTheme: jest.fn() }));
jest.mock('@/src/hooks/useObservable', () => ({ useObservable: jest.fn() }));
jest.mock('@/src/features/app/hooks/loadWidgetModule', () => ({ loadWidgetModule: jest.fn() }));
jest.mock('@/modules/expo-widgets', () => ({
  __esModule: true,
  default: { syncWidgetData: jest.fn() },
}));

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
          currencyCode: dependencies[0] === 'workplace-a' ? 'USD' : 'EUR',
          firstMajorInflowDay: null,
          safeToSpend: dependencies[0] === 'workplace-a' ? 100 : 200,
          shortfall: 0,
          trajectoryMinBalance: 0,
        },
      }),
    );
    (loadWidgetModule as jest.Mock).mockResolvedValue(expoWidgetsModule);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('drops an A snapshot when its lazy module load resolves after switching to B', async () => {
    let resolveWorkplaceALoad!: (module: typeof expoWidgetsModule) => void;
    const workplaceALoad = new Promise<typeof expoWidgetsModule>(resolve => {
      resolveWorkplaceALoad = resolve;
    });
    (loadWidgetModule as jest.Mock)
      .mockImplementationOnce(() => workplaceALoad)
      .mockResolvedValue(expoWidgetsModule);

    const { rerender } = renderHook<void, { workplaceId: WorkplaceId }>(
      ({ workplaceId }) => useWidgetSync(workplaceId, 'USD'),
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

    expect(expoWidgetsModule.syncWidgetData).toHaveBeenCalledTimes(1);
    expect(
      (expoWidgetsModule.syncWidgetData as jest.Mock).mock.calls[0][0].safeToSpend,
    ).toMatchObject({ amount: 200, currencyCode: 'EUR' });
  });
});
