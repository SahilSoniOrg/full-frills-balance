import { WorkplaceProvider } from '@/src/contexts/WorkplaceContext';
import { EmptyStateView, LoadingView } from '@/src/components/core';
import { useAppReady } from '@/src/contexts/app-shell/AppReadyProvider';
import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { RestartRequiredScreen } from '@/src/features/dev';
import { WorkplacePicker } from '@/src/features/app/WorkplacePicker';
import { workplaceService } from '@/src/services/WorkplaceService';
import {
  resolveLaunchGate,
  LaunchResolution,
  LaunchSetupDraft,
} from '@/src/services/launch/launchResolver';
import { applyDeviceRecovery, decideDeviceRecovery } from '@/src/services/launch/deviceRecovery';
import { PlainWorkplace } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
import { preferences } from '@/src/utils/preferences';
import { AppConfig } from '@/src/constants/app-config';
import { logger } from '@/src/utils/logger';
import { evictWorkplaceReactiveCaches } from '@/src/services/reactive/evictWorkplaceReactiveCaches';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Text, View } from 'react-native';
import { Observable } from 'rxjs';
import { Redirect, usePathname, useRouter } from 'expo-router';
export type { LaunchSetupDraft } from '@/src/services/launch/launchResolver';

export type LaunchCoordinatorState =
  | { kind: 'loading'; retry: () => void }
  | { kind: 'error'; error: Error; retry: () => void }
  | Extract<LaunchResolution, { kind: 'setup' }>
  | (LaunchResolution & {
      kind: 'device_onboarding' | 'workplace_creation';
    })
  | (Extract<LaunchResolution, { kind: 'picker' }> & { workplaces: PlainWorkplace[] })
  | Extract<LaunchResolution, { kind: 'open' }>;

const LaunchCoordinatorContext = createContext<LaunchCoordinatorState | undefined>(undefined);

export function useLaunchCoordinator(): LaunchCoordinatorState {
  const value = useContext(LaunchCoordinatorContext);
  if (!value) throw new Error('useLaunchCoordinator must be used within LaunchCoordinatorProvider');
  return value;
}

export function shouldRenderGateChildren(
  kind: LaunchCoordinatorState['kind'],
  pathname: string,
): boolean {
  const isGateRoute = pathname === '/onboarding' || pathname === '/import-selection';
  return (
    isGateRoute &&
    (kind === 'setup' ||
      kind === 'device_onboarding' ||
      kind === 'workplace_creation' ||
      kind === 'picker')
  );
}

function useWorkplaceDiscovery(enabled: boolean, retryToken: number) {
  const [result, setResult] = useState<{
    workplaces: PlainWorkplace[];
    error: Error | null;
    loading: boolean;
  }>({ workplaces: [], error: null, loading: true });
  const recoveryAppliedRef = React.useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const subscription = (
      workplaceService.observeAllWorkplaces() as Observable<PlainWorkplace[]>
    ).subscribe({
      next: workplaces => {
        if (!recoveryAppliedRef.current) {
          const recovery = decideDeviceRecovery({
            deviceBagPresent: preferences.rawDeviceBagPresentAtStartup,
            deviceClaimed: preferences.device.deviceRegistered,
            workplaceCount: workplaces.length,
            userName: preferences.userName,
          });
          try {
            applyDeviceRecovery(recovery);
            recoveryAppliedRef.current = true;
          } catch (error) {
            setResult({
              workplaces: [],
              error: error instanceof Error ? error : new Error(String(error)),
              loading: false,
            });
            return;
          }
        }
        setResult({ workplaces, error: null, loading: false });
      },
      error: error => {
        setResult({
          workplaces: [],
          error: error instanceof Error ? error : new Error(String(error)),
          loading: false,
        });
      },
    });
    return () => subscription.unsubscribe();
  }, [enabled, retryToken]);

  return result;
}

export function LaunchCoordinatorProvider({
  children,
  setupDraft,
}: {
  children: React.ReactNode;
  /** Validated projection of the device-local Setup draft, when present. */
  setupDraft?: LaunchSetupDraft;
}) {
  const { isInitialized } = useAppReady();
  const [retryToken, setRetryToken] = useState(0);
  const activeWorkplaceId = useSyncExternalStore(
    onStoreChange => {
      const subscription = preferences.device.observe('activeWorkplaceId').subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () => preferences.device.activeWorkplaceId,
    () => preferences.device.activeWorkplaceId,
  );
  const deviceClaimed = useSyncExternalStore(
    onStoreChange => {
      const subscription = preferences.device.observe('deviceRegistered').subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () => preferences.device.deviceRegistered,
    () => preferences.device.deviceRegistered,
  );
  const discovery = useWorkplaceDiscovery(isInitialized, retryToken);
  const [failedPointerRepairId, setFailedPointerRepairId] = useState<WorkplaceId | null>(null);
  const resolution = useMemo(() => {
    const retry = () => {
      setFailedPointerRepairId(null);
      setRetryToken(token => token + 1);
    };
    if (discovery.error) return { kind: 'error' as const, error: discovery.error, retry };
    if (!isInitialized || discovery.loading) return { kind: 'loading' as const, retry };
    const next = resolveLaunchGate({
      setupDraft,
      deviceClaimed,
      activeWorkplaceId,
      workplaceIds: discovery.workplaces.map(workplace => workplace.id),
    });
    if (next.kind === 'picker') {
      return { ...next, workplaces: discovery.workplaces };
    }
    if (next.kind !== 'open') return next;
    if (!discovery.workplaces.some(item => item.id === next.workplaceId)) {
      return { kind: 'loading' as const, retry };
    }
    return next;
  }, [
    activeWorkplaceId,
    deviceClaimed,
    setupDraft,
    discovery.error,
    discovery.loading,
    discovery.workplaces,
    isInitialized,
  ]);

  const state = useMemo<LaunchCoordinatorState>(() => {
    if (
      resolution.kind === 'open' &&
      resolution.persistAsActive &&
      failedPointerRepairId !== resolution.workplaceId
    ) {
      return { kind: 'loading', retry: () => setRetryToken(token => token + 1) };
    }
    return resolution;
  }, [failedPointerRepairId, resolution]);

  useEffect(() => {
    if (resolution.kind === 'open' && resolution.persistAsActive) {
      let cancelled = false;
      void Promise.resolve()
        .then(() => {
          if (cancelled) return;
          workplaceService.publishActiveWorkplace(resolution.workplaceId);
        })
        .catch(error => {
          if (cancelled) return;
          setFailedPointerRepairId(resolution.workplaceId);
          logger.warn('[LaunchCoordinator] Failed to repair active Workplace pointer', { error });
        });
      return () => {
        cancelled = true;
      };
    }
  }, [resolution]);

  return (
    <LaunchCoordinatorContext.Provider value={state}>{children}</LaunchCoordinatorContext.Provider>
  );
}

export function LaunchCoordinatorContent({
  children,
  gateChildren,
}: {
  children: React.ReactNode;
  /** Routes usable without a Workplace (onboarding/import/picker shell). */
  gateChildren?: React.ReactNode;
}) {
  const state = useLaunchCoordinator();
  const { isRestartRequired } = useAppRestart();
  const router = useRouter();
  const pathname = usePathname();
  const previousOpenWorkplaceId = useRef<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [pendingDeletionId, setPendingDeletionId] = useState<WorkplaceId | null>(null);
  const transitionSequence = useRef(0);
  const transitionInFlightRef = useRef<Promise<void> | null>(null);
  const deletionInFlightRef = useRef<Promise<{
    status: 'committed' | 'committed_with_warnings';
    warnings: string[];
  }> | null>(null);
  const deletionWaiterRef = useRef<{
    resolve: (result: {
      status: 'committed' | 'committed_with_warnings';
      warnings: string[];
    }) => void;
    reject: (error: unknown) => void;
  } | null>(null);
  useEffect(() => {
    if (
      state.kind === 'setup' ||
      state.kind === 'device_onboarding' ||
      state.kind === 'workplace_creation'
    ) {
      if (pathname !== '/onboarding' && pathname !== '/import-selection') {
        // Prevent a direct books deep link from mounting without a Workplace.
        router.replace('/onboarding');
      }
      return;
    }
    if (
      state.kind === 'picker' &&
      pathname !== '/' &&
      pathname !== '' &&
      pathname !== '/onboarding' &&
      pathname !== '/import-selection'
    ) {
      // A books deep link has no unambiguous Workplace while the picker is open.
      router.replace('/');
      return;
    }
    if (
      state.kind === 'open' &&
      previousOpenWorkplaceId.current !== null &&
      previousOpenWorkplaceId.current !== state.workplaceId &&
      pathname !== '/import-selection'
    ) {
      router.replace('/');
    }
    if (state.kind === 'open') previousOpenWorkplaceId.current = state.workplaceId;
  }, [pathname, router, state]);
  const transitionToWorkplace = async (targetId: WorkplaceId, previousId?: WorkplaceId) => {
    if (transitionInFlightRef.current) {
      await transitionInFlightRef.current;
      return;
    }

    const transitionId = `workplace-transition-${++transitionSequence.current}`;
    setTransitionError(null);
    setIsTransitioning(true);
    const transition = (async () => {
      logger.info('[WorkplaceTransition] started', {
        transitionId,
        fromWorkplaceId: previousId,
        toWorkplaceId: targetId,
      });
      try {
        await workplaceService.switchWorkplace(targetId);
        if (previousId) {
          evictWorkplaceReactiveCaches({ from: previousId, to: targetId });
        }
        logger.info('[WorkplaceTransition] pointer-persisted', {
          transitionId,
          fromWorkplaceId: previousId,
          toWorkplaceId: targetId,
        });
        // Picker selections have no previously open workplace for the route
        // effect to observe. Open-to-open transitions are redirected there
        // when the validated launch state changes.
        if (!previousId) router.replace('/');
        logger.info('[WorkplaceTransition] completed', {
          transitionId,
          toWorkplaceId: targetId,
        });
      } catch (error) {
        // A failed pointer write must not strand the app on an unmounted target.
        if (previousId && preferences.device.activeWorkplaceId !== previousId) {
          try {
            await workplaceService.switchWorkplace(previousId);
            logger.warn('[WorkplaceTransition] rolled-back', {
              transitionId,
              restoredWorkplaceId: previousId,
              failedWorkplaceId: targetId,
            });
          } catch (rollbackError) {
            // Preserve the original failure; the next launch will recover by discovery.
            logger.error('[WorkplaceTransition] rollback-failed', rollbackError, {
              transitionId,
              failedWorkplaceId: targetId,
              attemptedRestoreWorkplaceId: previousId,
            });
          }
        }
        logger.error('[WorkplaceTransition] failed', error, {
          transitionId,
          fromWorkplaceId: previousId,
          toWorkplaceId: targetId,
        });
        setTransitionError(error instanceof Error ? error.message : 'Could not switch workplace.');
      } finally {
        setIsTransitioning(false);
      }
    })();
    transitionInFlightRef.current = transition;
    try {
      await transition;
    } finally {
      if (transitionInFlightRef.current === transition) {
        transitionInFlightRef.current = null;
      }
    }
  };
  useEffect(() => {
    if (!pendingDeletionId) return;

    let cancelled = false;
    const deletion = async () => {
      try {
        const result = await workplaceService.deleteWorkplace(pendingDeletionId);
        evictWorkplaceReactiveCaches({ from: pendingDeletionId, to: pendingDeletionId });
        if (!cancelled) deletionWaiterRef.current?.resolve(result);
        return result;
      } catch (error) {
        if (!cancelled) {
          setTransitionError(
            error instanceof Error ? error.message : 'Could not delete workplace.',
          );
          deletionWaiterRef.current?.reject(error);
        }
        throw error;
      } finally {
        if (!cancelled) {
          deletionWaiterRef.current = null;
          deletionInFlightRef.current = null;
          setPendingDeletionId(null);
          setIsTransitioning(false);
        }
      }
    };

    const promise = deletion();
    void promise.catch(() => {
      // The caller-facing promise carries the failure; avoid an unhandled
      // rejection from the effect-owned operation promise.
    });
    deletionInFlightRef.current = promise;
    return () => {
      cancelled = true;
      if (deletionWaiterRef.current) {
        deletionWaiterRef.current.reject(new Error('Workplace deletion was interrupted.'));
        deletionWaiterRef.current = null;
        deletionInFlightRef.current = null;
      }
    };
  }, [pendingDeletionId]);

  if (isRestartRequired) return <RestartRequiredScreen />;

  const deleteWorkplace = async (targetId: WorkplaceId) => {
    if (transitionInFlightRef.current) await transitionInFlightRef.current;
    if (deletionInFlightRef.current) return deletionInFlightRef.current;
    const previousId = state.kind === 'open' ? state.workplaceId : undefined;
    setTransitionError(null);

    // An active Workplace must be unmounted in a committed render before its
    // rows are destroyed. Non-active deletion can stay on the current books.
    if (previousId === targetId) {
      const promise = new Promise<{
        status: 'committed' | 'committed_with_warnings';
        warnings: string[];
      }>((resolve, reject) => {
        deletionWaiterRef.current = { resolve, reject };
        setPendingDeletionId(targetId);
        setIsTransitioning(true);
      });
      deletionInFlightRef.current = promise;
      return promise;
    }

    try {
      const result = await workplaceService.deleteWorkplace(targetId);
      evictWorkplaceReactiveCaches({ from: targetId, to: targetId });
      return result;
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : 'Could not delete workplace.');
      throw error;
    }
  };
  const switchWorkplace = async (targetId: WorkplaceId) => {
    if (state.kind !== 'open' || state.workplaceId === targetId) return;
    await transitionToWorkplace(targetId, state.workplaceId);
  };
  if (state.kind === 'open') {
    if (isTransitioning) {
      return <LoadingView loading text={AppConfig.strings.settings.workplacePicker.switching} />;
    }
    return (
      <WorkplaceProvider
        workplaceId={state.workplaceId}
        onSwitchWorkplace={switchWorkplace}
        onDeleteWorkplace={deleteWorkplace}
      >
        {children}
      </WorkplaceProvider>
    );
  }
  if (state.kind === 'error') {
    const copy = AppConfig.strings.settings.workplacePicker;
    return (
      <EmptyStateView
        title={copy.loadError}
        subtitle={copy.loadErrorSubtitle}
        primaryActionLabel={copy.retry}
        onPrimaryAction={state.retry}
      />
    );
  }
  if (state.kind === 'loading') {
    return <LoadingView loading text={AppConfig.strings.common.loading} />;
  }
  if (
    gateChildren &&
    (state.kind === 'setup' ||
      state.kind === 'device_onboarding' ||
      state.kind === 'workplace_creation') &&
    pathname !== '/onboarding' &&
    pathname !== '/import-selection'
  ) {
    return <Redirect href="/onboarding" />;
  }
  if (gateChildren && shouldRenderGateChildren(state.kind, pathname)) {
    return <>{gateChildren}</>;
  }
  if (state.kind === 'picker') {
    return (
      <WorkplacePicker
        workplaces={state.workplaces}
        transitionError={transitionError}
        isTransitioning={isTransitioning}
        onSelect={id => void transitionToWorkplace(id)}
        onCreate={() => router.replace({ pathname: '/onboarding', params: { mode: 'full' } })}
        onImport={() => router.replace('/import-selection')}
      />
    );
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>
        {state.kind === 'setup'
          ? 'Setup'
          : state.kind === 'device_onboarding'
            ? 'Device setup'
            : 'Create a workplace'}
      </Text>
    </View>
  );
}
