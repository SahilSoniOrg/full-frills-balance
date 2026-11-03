import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { accountQueryRepository } from '@/src/data/repositories/account/AccountQueryRepository';
import { useAppBootstrap } from '@/src/features/app/hooks/useAppBootstrap';
import { currencyInitService } from '@/src/services/currency-init-service';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { insightService } from '@/src/services/insight/InsightService';
import { runStartupCheck } from '@/src/services/integrity';
import { processDuePlannedPayments } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { preferences } from '@/src/services/preferences';
import { WorkplaceId } from '@/src/types/ids';
import { purgeLocalAiCachesOnce } from '@/src/features/app/purgeLocalAiCaches';
import { notificationService } from '@/src/services/notification/NotificationService';
import { automaticSmsImportService } from '@/src/services/sms/AutomaticSmsImportService';
import { analytics } from '@/src/services/analytics';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@/src/contexts/app-shell/appReady', () => ({ useAppReady: jest.fn() }));
jest.mock('@/src/features/app/bootstrap', () => ({ runAppBootstrapSideEffects: jest.fn() }));
jest.mock('@/src/features/app/journalBalanceStartupCheck', () => ({
  checkJournalBalancesOnStartup: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/features/app/purgeLocalAiCaches', () => ({
  purgeLocalAiCachesOnce: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/services/analytics', () => ({
  analytics: {
    delayedInitializePostHog: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
    identify: jest.fn(),
    track: jest.fn(),
    syncActiveWorkplace: jest.fn(),
  },
}));
jest.mock('@/src/services/currency-init-service', () => ({
  currencyInitService: { initialize: jest.fn() },
}));
jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: { getAllPrecisions: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/data/repositories/account/AccountQueryRepository', () => ({
  accountQueryRepository: {
    findAll: jest.fn().mockResolvedValue([{ currencyCode: 'USD' }, { currencyCode: 'EUR' }]),
  },
}));
jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    preWarmCache: jest.fn().mockResolvedValue(undefined),
    refreshSpotBasesInBackground: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/src/services/insight/InsightService', () => ({
  insightService: { preWarm: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/integrity', () => ({
  runStartupCheck: jest.fn().mockResolvedValue(undefined),
  cleanupGhostWorkplaces: jest.fn().mockResolvedValue({ cleanedCount: 0 }),
}));
jest.mock('@/src/services/notification/NotificationService', () => ({
  notificationService: { scheduleReminder: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/sms/AutomaticSmsImportService', () => ({
  automaticSmsImportService: { synchronizeOnAppStart: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/planned-payment/plannedPaymentOrchestration', () => ({
  processDuePlannedPayments: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/services/ReactiveDataService', () => ({
  reactiveDataService: { preWarm: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/SharingService', () => ({
  sharingService: { init: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/simulation/SafeToSpendReadModel', () => ({
  safeToSpendReadModel: {
    forWorkplace: jest.fn(() => ({ preWarm: jest.fn().mockResolvedValue(undefined) })),
  },
}));
jest.mock('@/src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: {
    device: {
      anonymizedId: 'anonymous-test-id' as string | undefined,
      hasTrackedInstall: false,
      setAnonymizedId: jest.fn(),
      setHasTrackedInstall: jest.fn(),
      getSnapshot: () => ({ isSmsImportEnabled: false }),
    },
    getSnapshot: () => ({
      notificationCadence: 'daily',
      notificationHour: 9,
      notificationMinute: 0,
      notificationWeekday: 1,
    }),
  },
}));
jest.mock('@/src/utils/scheduler', () => ({
  runAfterInteractions: jest.fn((task: () => void) => {
    task();
    return jest.fn();
  }),
}));

const devicePrefs = preferences.device as unknown as {
  anonymizedId: string | undefined;
  hasTrackedInstall: boolean;
  setAnonymizedId: jest.Mock;
  setHasTrackedInstall: jest.Mock;
};

describe('useAppBootstrap generation safety', () => {
  const setDataHydrated = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    devicePrefs.anonymizedId = 'anonymous-test-id';
    devicePrefs.hasTrackedInstall = false;
    (useAppReady as jest.Mock).mockReturnValue({ isAppReady: true, setDataHydrated });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not run first-paint work at 50ms and only stabilizes the current workplace', async () => {
    const { rerender } = renderHook<void, { workplaceId: WorkplaceId; currencyCode: string }>(
      ({ workplaceId, currencyCode }) => useAppBootstrap(workplaceId, currencyCode),
      {
        initialProps: {
          workplaceId: 'workplace-a' as WorkplaceId,
          currencyCode: 'USD',
        },
      },
    );

    await act(async () => {
      jest.advanceTimersByTime(50);
    });
    expect(currencyInitService.initialize).not.toHaveBeenCalled();
    expect(reactiveDataService.preWarm).not.toHaveBeenCalled();

    rerender({ workplaceId: 'workplace-b' as WorkplaceId, currencyCode: 'EUR' });

    await act(async () => {
      jest.advanceTimersByTime(50);
      await Promise.resolve();
    });
    expect(currencyInitService.initialize).not.toHaveBeenCalled();
    expect(reactiveDataService.preWarm).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(currencyInitService.initialize).toHaveBeenCalledTimes(1);
    expect(purgeLocalAiCachesOnce).toHaveBeenCalled();
    expect(accountQueryRepository.findAll).toHaveBeenCalledWith('workplace-b' as WorkplaceId);
    expect(exchangeRateService.preWarmCache).toHaveBeenCalledWith('EUR', ['USD', 'EUR']);
    expect(reactiveDataService.preWarm).not.toHaveBeenCalledWith(
      'USD',
      'workplace-a' as WorkplaceId,
    );
    expect(reactiveDataService.preWarm).toHaveBeenCalledWith('EUR', 'workplace-b' as WorkplaceId);

    expect(insightService.preWarm).toHaveBeenCalledTimes(1);
    expect(insightService.preWarm).toHaveBeenCalledWith('workplace-b' as WorkplaceId);
    expect(runStartupCheck).toHaveBeenCalledWith(
      'workplace-b' as WorkplaceId,
      expect.any(AbortSignal),
    );
    expect(processDuePlannedPayments).toHaveBeenCalledWith(
      'workplace-b' as WorkplaceId,
      expect.any(AbortSignal),
    );
  });

  it('starts reminders and SMS setup while optional FX warmup is still pending', async () => {
    let releaseFx!: () => void;
    (exchangeRateService.preWarmCache as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          releaseFx = resolve;
        }),
    );
    const { unmount } = renderHook(() => useAppBootstrap('workplace-a' as WorkplaceId, 'USD'));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(exchangeRateService.preWarmCache).toHaveBeenCalled();
    expect(notificationService.scheduleReminder).toHaveBeenCalled();
    expect(automaticSmsImportService.synchronizeOnAppStart).toHaveBeenCalled();
    expect(processDuePlannedPayments).toHaveBeenCalled();
    expect(reactiveDataService.preWarm).not.toHaveBeenCalled();
    unmount();
    await act(async () => {
      releaseFx();
    });
    expect(reactiveDataService.preWarm).not.toHaveBeenCalled();
  });

  it('mints a non-production telemetry id when this install has none', async () => {
    devicePrefs.anonymizedId = undefined;

    renderHook(() => useAppBootstrap('workplace-a' as WorkplaceId, 'USD'));

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(devicePrefs.setAnonymizedId).toHaveBeenCalledWith(expect.stringMatching(/^dev_/));
  });

  it('remints a production-shaped telemetry id on a non-prod install', async () => {
    devicePrefs.anonymizedId = 'anon_old_id';

    renderHook(() => useAppBootstrap('workplace-a' as WorkplaceId, 'USD'));

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(devicePrefs.setAnonymizedId).toHaveBeenCalledWith(expect.stringMatching(/^dev_/));
  });

  it('records app_installed once and persists the install flag', async () => {
    (analytics.track as jest.Mock).mockReturnValue(true);

    renderHook(() => useAppBootstrap('workplace-a' as WorkplaceId, 'USD'));

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(analytics.track).toHaveBeenCalledWith('app_installed', expect.any(Object));
    expect(devicePrefs.setHasTrackedInstall).toHaveBeenCalledWith(true);
  });

  it('does not repeat app_installed after the install flag is set', async () => {
    devicePrefs.hasTrackedInstall = true;
    (analytics.track as jest.Mock).mockReturnValue(true);

    renderHook(() => useAppBootstrap('workplace-a' as WorkplaceId, 'USD'));

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(analytics.track).not.toHaveBeenCalledWith('app_installed', expect.anything());
    expect(devicePrefs.setHasTrackedInstall).not.toHaveBeenCalled();
  });
});
