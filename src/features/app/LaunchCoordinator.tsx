import { AppText, EmptyStateView, LoadingView } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { WorkplaceProvider } from '@/src/contexts/WorkplaceContext';
import { useAppReady } from '@/src/contexts/app-shell/AppReadyProvider';
import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { generator } from '@/src/data/database/idGenerator';
import { WorkplacePicker } from '@/src/features/app/WorkplacePicker';
import { RestartRequiredScreen } from '@/src/features/dev';
import {
  createSetupDraft,
  loadSetupDraft,
  saveSetupDraft,
  SETUP_GATE_ROUTES,
  setupEntryPath,
  shouldRedirectSetupToEntry,
  shouldRenderSetupGateChildren,
} from '@/src/features/setup';
import { useTheme } from '@/src/hooks/use-theme';
import { dispatchWorkplaceSwitchHistory } from '@/src/navigation/workplaceSwitchHistory';
import { sharingRuntime } from '@/src/services/SharingService';
import { workplaceService } from '@/src/services/WorkplaceService';
import { applyDeviceRecovery, decideDeviceRecovery } from '@/src/services/launch/deviceRecovery';
import {
  LaunchResolution,
  LaunchSetupDraft,
  resolveLaunchGate,
} from '@/src/services/launch/launchResolver';
import {
  hasAcknowledgedCurrentPrivacyPolicy,
  subscribeToPrivacyPolicyAcknowledgement,
} from '@/src/services/legal/privacyPolicyAcceptance';
import { preferences } from '@/src/services/preferences';
import { evictWorkplaceReactiveCaches } from '@/src/services/reactive/evictWorkplaceReactiveCaches';
import { isSetupJourneyId } from '@/src/services/setup/setupDraftIdentity';
import { WorkplaceId } from '@/src/types/ids';
import { PlainWorkplace } from '@/src/types/plainDtos';
import { alert, confirm } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import * as Linking from 'expo-linking';
import {
  Redirect,
  useGlobalSearchParams,
  useNavigationContainerRef,
  usePathname,
  useRouter,
} from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { filter, firstValueFrom, Observable, timeout, TimeoutError } from 'rxjs';
export {
  setupEntryPath,
  shouldRedirectSetupToEntry,
  shouldShowCashClarity,
} from '@/src/features/setup';
export type { LaunchSetupDraft } from '@/src/services/launch/launchResolver';

export type LaunchCoordinatorState =
  | { kind: 'loading'; retry: () => void }
  | { kind: 'error'; error: Error; retry: () => void }
  | Extract<LaunchResolution, { kind: 'setup' }>
  | (Extract<LaunchResolution, { kind: 'picker' }> & { workplaces: PlainWorkplace[] })
  | Extract<LaunchResolution, { kind: 'open' }>;

const WORKPLACE_SCOPE_TIMEOUT_MS = 15_000;
const WORKPLACE_SWITCH_TIMEOUT_MESSAGE = 'Switching workplace took too long. Try again.';

async function awaitWorkplaceScope(
  workplaceId: WorkplaceId,
  timeoutMs: number = WORKPLACE_SCOPE_TIMEOUT_MS,
): Promise<PlainWorkplace> {
  try {
    return await firstValueFrom(
      workplaceService.observeWorkplace(workplaceId).pipe(
        filter(workplace => !!workplace.defaultCurrencyCode),
        timeout(timeoutMs),
      ),
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw new Error(WORKPLACE_SWITCH_TIMEOUT_MESSAGE);
    }
    throw error instanceof Error ? error : new Error(`Workplace is unavailable: ${workplaceId}`);
  }
}

function remainingSwitchMs(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

const LaunchCoordinatorContext = createContext<LaunchCoordinatorState | undefined>(undefined);

export function useLaunchCoordinator(): LaunchCoordinatorState {
  const value = useContext(LaunchCoordinatorContext);
  if (!value) throw new Error('useLaunchCoordinator must be used within LaunchCoordinatorProvider');
  return value;
}

export function shouldRenderGateChildren(
  kind: LaunchCoordinatorState['kind'],
  pathname: string,
  journeyId?: string,
): boolean {
  if (!(kind === 'setup' || kind === 'picker')) return false;
  return kind === 'setup'
    ? shouldRenderSetupGateChildren(pathname, journeyId)
    : SETUP_GATE_ROUTES.has(pathname);
}

export function shouldRedirectToPrivacyNotice(
  kind: LaunchCoordinatorState['kind'],
  pathname: string,
  isPrivacyPolicyAcknowledged: boolean,
): boolean {
  return (
    !isPrivacyPolicyAcknowledged &&
    pathname !== '/privacy-notice' &&
    (kind === 'picker' || kind === 'open')
  );
}

function useWorkplaceDiscovery(enabled: boolean, retryToken: number) {
  const [result, setResult] = useState<{
    workplaces: PlainWorkplace[];
    error: Error | null;
    loading: boolean;
  }>({ workplaces: [], error: null, loading: true });
  const recoveryAppliedRef = React.useRef(false);
  const legacyCurrencyMigrationRef = React.useRef<Promise<void> | null>(null);
  const initialWorkplaceIdsRef = React.useRef<readonly WorkplaceId[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const migrateLegacyCurrency = (workplaceIds: readonly WorkplaceId[]) => {
      if (!legacyCurrencyMigrationRef.current) {
        legacyCurrencyMigrationRef.current = workplaceService
          .migrateLegacyCurrency(workplaceIds)
          .finally(() => {
            legacyCurrencyMigrationRef.current = null;
          });
      }
      return legacyCurrencyMigrationRef.current;
    };
    const subscription = (
      workplaceService.observeAllWorkplaces() as Observable<PlainWorkplace[]>
    ).subscribe({
      next: workplaces => {
        if (initialWorkplaceIdsRef.current === null) {
          initialWorkplaceIdsRef.current = workplaces.map(workplace => workplace.id);
        }
        void migrateLegacyCurrency(initialWorkplaceIdsRef.current)
          .then(() => {
            if (cancelled) return;
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
          })
          .catch(error => {
            if (cancelled) return;
            setResult({
              workplaces: [],
              error: error instanceof Error ? error : new Error(String(error)),
              loading: false,
            });
          });
      },
      error: error => {
        if (cancelled) return;
        setResult({
          workplaces: [],
          error: error instanceof Error ? error : new Error(String(error)),
          loading: false,
        });
      },
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
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

  useEffect(() => {
    if (resolution.kind !== 'setup' || resolution.unreadable) return;
    if (!isSetupJourneyId(resolution.journeyId)) return;
    if (loadSetupDraft()) return;
    saveSetupDraft(createSetupDraft(resolution.journeyId, generator() as WorkplaceId));
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
  const globalParams = useGlobalSearchParams();
  const routeWidgetWorkplaceId =
    globalParams.source === 'widget' && typeof globalParams.workplaceId === 'string'
      ? (globalParams.workplaceId as WorkplaceId)
      : undefined;
  const [pendingWidgetWorkplaceId, setPendingWidgetWorkplaceId] = useState<WorkplaceId | null>(
    null,
  );
  const handledWidgetPromptRef = useRef<{
    widgetWorkplaceId: WorkplaceId;
    currentWorkplaceId: WorkplaceId | null;
  } | null>(null);
  useEffect(() => {
    const captureWidgetLaunch = (url: string | null, isInitialUrl = false) => {
      if (!url) return;
      const params = Linking.parse(url).queryParams;
      if (params?.source === 'widget' && typeof params.workplaceId === 'string') {
        if (!isInitialUrl) {
          handledWidgetPromptRef.current = null;
        }
        setPendingWidgetWorkplaceId(params.workplaceId as WorkplaceId);
      }
    };

    void Linking.getInitialURL()
      .then(url => captureWidgetLaunch(url, true))
      .catch(error =>
        logger.warn('[LaunchCoordinator] Could not read initial widget link', { error }),
      );
    const subscription = Linking.addEventListener('url', ({ url }) => captureWidgetLaunch(url));
    return () => subscription.remove();
  }, []);
  const widgetWorkplaceId = routeWidgetWorkplaceId ?? pendingWidgetWorkplaceId ?? undefined;
  const isPrivacyPolicyAcknowledged = useSyncExternalStore(
    subscribeToPrivacyPolicyAcknowledgement,
    hasAcknowledgedCurrentPrivacyPolicy,
    hasAcknowledgedCurrentPrivacyPolicy,
  );
  const widgetPromptContextRef = useRef({
    workplaceId: widgetWorkplaceId,
    isPrivacyPolicyAcknowledged,
  });
  useEffect(() => {
    widgetPromptContextRef.current = {
      workplaceId: widgetWorkplaceId,
      isPrivacyPolicyAcknowledged,
    };
  }, [widgetWorkplaceId, isPrivacyPolicyAcknowledged]);
  const isWidgetWorkplaceSwitchPending =
    widgetWorkplaceId !== undefined &&
    (state.kind === 'picker' || (state.kind === 'open' && state.workplaceId !== widgetWorkplaceId));
  const privacyRedirectInFlight = useRef(false);
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
  const rootNavigation = useNavigationContainerRef();
  const clearWorkplaceHistory = useCallback(() => {
    dispatchWorkplaceSwitchHistory({
      getState: () => rootNavigation.getRootState(),
      dispatch: action => rootNavigation.dispatch(action),
    });
  }, [rootNavigation]);
  const committedWorkplaceRef = useRef<{
    id: WorkplaceId | null;
    waiters: Set<(id: WorkplaceId) => void>;
  }>({ id: null, waiters: new Set() });
  const onCommittedWorkplace = useCallback((id: WorkplaceId) => {
    committedWorkplaceRef.current.id = id;
    for (const waiter of [...committedWorkplaceRef.current.waiters]) {
      waiter(id);
    }
  }, []);
  const awaitCommittedWorkplace = useCallback((targetId: WorkplaceId, timeoutMs: number) => {
    if (committedWorkplaceRef.current.id === targetId) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        committedWorkplaceRef.current.waiters.delete(onReady);
        reject(new Error(WORKPLACE_SWITCH_TIMEOUT_MESSAGE));
      }, timeoutMs);
      const onReady = (id: WorkplaceId) => {
        if (id !== targetId) return;
        clearTimeout(timer);
        committedWorkplaceRef.current.waiters.delete(onReady);
        resolve();
      };
      committedWorkplaceRef.current.waiters.add(onReady);
    });
  }, []);
  useEffect(() => {
    if (shouldRedirectToPrivacyNotice(state.kind, pathname, isPrivacyPolicyAcknowledged)) {
      if (!privacyRedirectInFlight.current) {
        privacyRedirectInFlight.current = true;
        router.push({ pathname: '/privacy-notice', params: { required: '1' } });
      }
      return;
    }
    privacyRedirectInFlight.current = false;

    if (state.kind === 'setup') {
      if (shouldRedirectSetupToEntry(state.journeyId, pathname)) {
        // Keep first-run off the legacy wizard and books-only deep links.
        router.replace(setupEntryPath());
      }
      return;
    }
    if (
      state.kind === 'picker' &&
      pathname !== '/' &&
      pathname !== '' &&
      !SETUP_GATE_ROUTES.has(pathname) &&
      !isWidgetWorkplaceSwitchPending
    ) {
      // A books deep link has no unambiguous Workplace while the picker is open.
      router.replace('/');
    }
  }, [isPrivacyPolicyAcknowledged, isWidgetWorkplaceSwitchPending, pathname, router, state]);
  const transitionToWorkplace = useCallback(
    async (
      targetId: WorkplaceId,
      previousId?: WorkplaceId,
      options?: { preserveRoute?: boolean },
    ) => {
      setTransitionError(null);
      const queuedBehind = transitionInFlightRef.current;
      if (!queuedBehind) setIsTransitioning(true);

      const runTransition = async () => {
        const fromWorkplaceId = queuedBehind
          ? (preferences.device.activeWorkplaceId ?? previousId)
          : previousId;
        if (preferences.device.activeWorkplaceId === targetId) return;

        setTransitionError(null);
        const releaseSharing = fromWorkplaceId
          ? sharingRuntime.beginWorkplaceTransition(fromWorkplaceId, 'switch')
          : () => {};
        const transitionId = `workplace-transition-${++transitionSequence.current}`;
        const deadline = Date.now() + WORKPLACE_SCOPE_TIMEOUT_MS;
        let pointerMoved = false;
        logger.info('[WorkplaceTransition] started', {
          transitionId,
          fromWorkplaceId,
          toWorkplaceId: targetId,
        });
        try {
          // Validate the target under the prior provider, clear record routes,
          // write the pointer, then keep the overlay until committed books match.
          await awaitWorkplaceScope(targetId, remainingSwitchMs(deadline));
          if (fromWorkplaceId) clearWorkplaceHistory();
          await workplaceService.switchWorkplace(targetId);
          pointerMoved = true;
          logger.info('[WorkplaceTransition] pointer-persisted', {
            transitionId,
            fromWorkplaceId,
            toWorkplaceId: targetId,
          });
          // Picker selections have no previously open workplace to clear.
          if (!fromWorkplaceId && !options?.preserveRoute) router.replace('/');
          await awaitCommittedWorkplace(targetId, remainingSwitchMs(deadline));
          logger.info('[WorkplaceTransition] completed', {
            transitionId,
            toWorkplaceId: targetId,
          });
        } catch (error) {
          logger.error('[WorkplaceTransition] failed', error, {
            transitionId,
            fromWorkplaceId,
            toWorkplaceId: targetId,
          });
          if (
            pointerMoved &&
            fromWorkplaceId &&
            preferences.device.activeWorkplaceId === targetId
          ) {
            try {
              await workplaceService.switchWorkplace(fromWorkplaceId);
            } catch (rollbackError) {
              logger.error('[WorkplaceTransition] rollback failed', rollbackError, {
                transitionId,
                fromWorkplaceId,
                toWorkplaceId: targetId,
              });
            }
          }
          setTransitionError(
            error instanceof Error ? error.message : 'Could not switch workplace.',
          );
        } finally {
          releaseSharing();
        }
      };
      const transition = (queuedBehind ?? Promise.resolve())
        .catch(() => undefined)
        .then(runTransition);
      transitionInFlightRef.current = transition;
      try {
        await transition;
      } finally {
        if (transitionInFlightRef.current === transition) {
          transitionInFlightRef.current = null;
          setIsTransitioning(false);
        }
      }
    },
    [awaitCommittedWorkplace, clearWorkplaceHistory, router],
  );
  useEffect(() => {
    if (!widgetWorkplaceId) return;
    if (state.kind !== 'open' && state.kind !== 'picker') return;
    if (!isPrivacyPolicyAcknowledged || pathname === '/privacy-notice') return;
    if (state.kind === 'open' && state.workplaceId === widgetWorkplaceId) return;
    const previousId = state.kind === 'open' ? state.workplaceId : undefined;
    const handledPrompt = handledWidgetPromptRef.current;
    if (
      handledPrompt?.widgetWorkplaceId === widgetWorkplaceId &&
      handledPrompt.currentWorkplaceId === (previousId ?? null)
    )
      return;

    handledWidgetPromptRef.current = {
      widgetWorkplaceId,
      currentWorkplaceId: previousId ?? null,
    };
    const continueInCurrentWorkplace = () => {
      setPendingWidgetWorkplaceId(null);
      router.replace('/(tabs)');
    };
    const switchToWidgetWorkplace = () => {
      setPendingWidgetWorkplaceId(null);
      void transitionToWorkplace(widgetWorkplaceId, previousId, { preserveRoute: true }).then(
        () => {
          if (preferences.device.activeWorkplaceId !== widgetWorkplaceId) {
            logger.warn(
              '[LaunchCoordinator] Widget workplace is unavailable; opening active workplace',
              {
                workplaceId: widgetWorkplaceId,
              },
            );
            router.replace('/(tabs)');
          }
        },
      );
    };

    if (!previousId) {
      switchToWidgetWorkplace();
      return;
    }

    void Promise.all([
      workplaceService.getWorkplace(previousId),
      workplaceService.getWorkplace(widgetWorkplaceId),
    ])
      .then(([currentWorkplace, widgetWorkplace]) => {
        const promptContext = widgetPromptContextRef.current;
        if (
          promptContext.workplaceId !== widgetWorkplaceId ||
          !promptContext.isPrivacyPolicyAcknowledged
        )
          return;
        if (!currentWorkplace) {
          setPendingWidgetWorkplaceId(null);
          logger.warn(
            '[LaunchCoordinator] Widget workplace is unavailable; opening active workplace',
            {
              workplaceId: widgetWorkplaceId,
            },
          );
          router.replace('/(tabs)');
          return;
        }
        if (!widgetWorkplace) {
          const copy = AppConfig.strings.settings.widgetWorkplacePrompt;
          alert.show({
            title: copy.unavailableTitle,
            message: copy.unavailableMessage(currentWorkplace.name),
            actionText: copy.continueIn(currentWorkplace.name),
            onAction: continueInCurrentWorkplace,
            onClose: continueInCurrentWorkplace,
          });
          return;
        }
        if (preferences.device.activeWorkplaceId !== previousId) {
          return;
        }

        const copy = AppConfig.strings.settings.widgetWorkplacePrompt;
        confirm.show({
          title: copy.title,
          message: copy.message(widgetWorkplace.name, currentWorkplace.name),
          messageContent: (
            <AppText>
              This widget uses{' '}
              <AppText color="primary" weight="semibold">
                {widgetWorkplace.name}
              </AppText>
              . You’re in{' '}
              <AppText color="primary" weight="semibold">
                {currentWorkplace.name}
              </AppText>
              . Switch?
            </AppText>
          ),
          cancelText: copy.stay,
          confirmText: copy.switchTo,
          onCancel: continueInCurrentWorkplace,
          onConfirm: switchToWidgetWorkplace,
          onClose: continueInCurrentWorkplace,
        });
      })
      .catch(error => {
        const promptContext = widgetPromptContextRef.current;
        if (
          promptContext.workplaceId !== widgetWorkplaceId ||
          !promptContext.isPrivacyPolicyAcknowledged
        )
          return;
        logger.warn('[LaunchCoordinator] Could not resolve widget workplace names', { error });
        setPendingWidgetWorkplaceId(null);
        router.replace('/(tabs)');
      });
  }, [
    isPrivacyPolicyAcknowledged,
    pathname,
    router,
    state,
    transitionToWorkplace,
    widgetWorkplaceId,
  ]);
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
    const releaseSharing = sharingRuntime.beginWorkplaceTransition(targetId, 'delete');
    try {
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
        return await promise;
      }

      try {
        const result = await workplaceService.deleteWorkplace(targetId);
        evictWorkplaceReactiveCaches({ from: targetId, to: targetId });
        return result;
      } catch (error) {
        setTransitionError(error instanceof Error ? error.message : 'Could not delete workplace.');
        throw error;
      }
    } finally {
      releaseSharing();
    }
  };
  const switchWorkplace = async (targetId: WorkplaceId) => {
    if (state.kind !== 'open' || state.workplaceId === targetId) return;
    await transitionToWorkplace(targetId, state.workplaceId);
  };
  if (state.kind === 'open') {
    if (pendingDeletionId) {
      return <LoadingView loading text={AppConfig.strings.settings.workplacePicker.switching} />;
    }
    return (
      <View style={styles.workplaceContent}>
        <WorkplaceProvider
          targetWorkplaceId={state.workplaceId}
          onSwitchWorkplace={switchWorkplace}
          onDeleteWorkplace={deleteWorkplace}
          onCommittedWorkplace={onCommittedWorkplace}
          isSwitchingWorkplace={isTransitioning}
          workplaceSwitchError={transitionError}
        >
          {children}
        </WorkplaceProvider>
        {isTransitioning ? <WorkplaceSwitchBlockingOverlay /> : null}
      </View>
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
  if (gateChildren && state.kind === 'setup' && !SETUP_GATE_ROUTES.has(pathname)) {
    return <Redirect href={setupEntryPath()} />;
  }
  if (
    gateChildren &&
    shouldRenderGateChildren(
      state.kind,
      pathname,
      state.kind === 'setup' ? state.journeyId : undefined,
    )
  ) {
    return <>{gateChildren}</>;
  }
  if (state.kind === 'picker') {
    return (
      <WorkplacePicker
        workplaces={state.workplaces}
        transitionError={transitionError}
        isTransitioning={isTransitioning}
        onSelect={id => void transitionToWorkplace(id)}
        onCreate={() =>
          router.replace({ pathname: '/onboarding', params: { journey: 'create_workplace' } })
        }
        onImport={() =>
          router.replace({ pathname: '/onboarding', params: { journey: 'picker_restore' } })
        }
      />
    );
  }
  return <Redirect href={state.kind === 'setup' ? setupEntryPath() : '/onboarding'} />;
}

function WorkplaceSwitchBlockingOverlay() {
  const { theme } = useTheme();
  const label = AppConfig.strings.settings.workplacePicker.switching;
  return (
    <View
      style={[styles.switchOverlay, { backgroundColor: theme.overlay }]}
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityLabel={label}
      accessibilityRole="progressbar"
    >
      <View style={[styles.switchCard, { backgroundColor: theme.surface }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <AppText variant="body" weight="semibold" align="center">
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  workplaceContent: { flex: 1 },
  switchOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  switchCard: {
    minWidth: 180,
    maxWidth: '85%',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 16,
  },
});
