import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { useAppBootstrap } from '@/src/features/app/hooks/useAppBootstrap';
import { currencyInitService } from '@/src/services/currency-init-service';
import { insightService } from '@/src/services/insight/InsightService';
import { integrityService } from '@/src/services/integrity';
import { processDuePlannedPayments } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { WorkplaceId } from '@/src/types/ids';
import { purgeLocalAiCachesOnce } from '@/src/features/app/purgeLocalAiCaches';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@/src/contexts/app-shell/appReady', () => ({ useAppReady: jest.fn() }));
jest.mock('@/src/features/app/bootstrap', () => ({ runAppBootstrapSideEffects: jest.fn() }));
jest.mock('@/src/features/app/purgeLocalAiCaches', () => ({
  purgeLocalAiCachesOnce: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/services/analytics', () => ({
  analytics: {
    delayedInitializePostHog: jest.fn(),
    identify: jest.fn(),
    logAppOpened: jest.fn(),
    syncActiveWorkplace: jest.fn(),
  },
}));
jest.mock('@/src/services/currency-init-service', () => ({
  currencyInitService: { initialize: jest.fn() },
}));
jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: { getAllPrecisions: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: { preWarmCache: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/insight/InsightService', () => ({
  insightService: { preWarm: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/integrity', () => ({
  integrityService: { runStartupCheck: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/notification/NotificationService', () => ({
  notificationService: { scheduleReminder: jest.fn().mockResolvedValue(undefined) },
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
  logger: { error: jest.fn(), info: jest.fn() },
}));
jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    anonymizedId: 'anonymous-test-id',
    notifications: {
      notificationCadence: 'daily',
      notificationHour: 9,
      notificationMinute: 0,
    },
    sms: { isSmsImportEnabled: false },
    setAnonymizedId: jest.fn(),
  },
}));
jest.mock('@/src/utils/scheduler', () => ({
  runAfterInteractions: jest.fn((task: () => void) => task()),
}));

describe('useAppBootstrap generation safety', () => {
  const setDataHydrated = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
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
    expect(reactiveDataService.preWarm).not.toHaveBeenCalledWith(
      'USD',
      'workplace-a' as WorkplaceId,
    );
    expect(reactiveDataService.preWarm).toHaveBeenCalledWith('EUR', 'workplace-b' as WorkplaceId);

    expect(insightService.preWarm).toHaveBeenCalledTimes(1);
    expect(insightService.preWarm).toHaveBeenCalledWith('workplace-b' as WorkplaceId);
    expect(integrityService.runStartupCheck).toHaveBeenCalledWith(
      'workplace-b' as WorkplaceId,
      expect.any(AbortSignal),
    );
    expect(processDuePlannedPayments).toHaveBeenCalledWith(
      'workplace-b' as WorkplaceId,
      expect.any(AbortSignal),
    );
  });
});
