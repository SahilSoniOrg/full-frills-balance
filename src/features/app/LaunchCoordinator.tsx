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
import type { RestoreJourneyId } from '@/src/features/setup';
import { useTheme } from '@/src/hooks/use-theme';
import { workplaceService } from '@/src/services/WorkplaceService';
import { applyDeviceRecovery, decideDeviceRecovery } from '@/src/services/launch/deviceRecovery';
import { resolveLaunchGate } from '@/src/services/launch/launchResolver';
import {
  hasAcknowledgedCurrentPrivacyPolicy,
  subscribeToPrivacyPolicyAcknowledgement,
} from '@/src/services/legal/privacyPolicyAcceptance';
import { preferences } from '@/src/services/preferences';
import {
  CreationLaunchProvider,
  CreationOpeningCoordinatorProvider,
  type CreationLaunchEntry,
  type CreationLaunchEntryContext,
  type CreationOpeningCoordinatorValue,
  type CreationOpeningTarget,
  useCreationOpeningCoordinator,
} from '@/src/contexts/CreationLaunchContext';
import { asWorkplaceId, type WorkplaceId } from '@/src/types/ids';
import type { PlainWorkplace } from '@/src/types/plainDtos';
import { logger } from '@/src/utils/logger';
import { AppNavigation, firstRunCreationHref, workplaceCreationHref } from '@/src/utils/navigation';
import { Redirect, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Observable } from 'rxjs';
import { useWorkplaceTransitions } from './hooks/useWorkplaceTransitions';
import { useWidgetWorkplaceIntent } from './hooks/useWidgetWorkplaceIntent';
import type { LaunchCoordinatorState, LaunchSetupDraft } from './LaunchCoordinator.types';
export type { LaunchCoordinatorState, LaunchSetupDraft } from './LaunchCoordinator.types';
export {
  normalizeCreationRoute,
  setupEntryPath,
  shouldRedirectSetupToEntry,
  shouldShowCashClarity,
} from '@/src/features/setup';

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

function creationLaunchEntry(
  state: LaunchCoordinatorState,
  requestedContext?: string,
): CreationLaunchEntry | undefined {
  if (state.kind === 'setup') {
    if (state.journeyId === 'first_run') {
      return {
        intent: 'first_run',
        context: 'unregistered_device',
        entryPolicy: 'blocking',
      };
    }
    if (state.journeyId === 'add_workplace') {
      return {
        intent: 'add_workplace',
        context: 'registered_empty_device',
        entryPolicy: 'blocking',
      };
    }
    return undefined;
  }

  if (state.kind === 'picker') {
    return {
      intent: 'add_workplace',
      context: 'workplace_picker',
      entryPolicy: 'optional',
    };
  }

  if (state.kind === 'open') {
    const context = creationLaunchContext(requestedContext) ?? 'existing_workplace_entry';
    return {
      intent: context === 'unregistered_device' ? 'first_run' : 'add_workplace',
      context,
      entryPolicy:
        context === 'unregistered_device' || context === 'registered_empty_device'
          ? 'blocking'
          : 'optional',
    };
  }

  return undefined;
}

function creationLaunchContext(value?: string): CreationLaunchEntryContext | undefined {
  switch (value) {
    case 'unregistered_device':
    case 'registered_empty_device':
    case 'workplace_picker':
    case 'existing_workplace_entry':
      return value;
    default:
      return undefined;
  }
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

function hasBlockingSetupDraft(draft?: LaunchSetupDraft): boolean {
  if (!draft) return false;
  if ('unreadable' in draft) return draft.unreadable === true;
  return draft.entryPolicy === 'blocking';
}

function restoreJourneyId(value: string): RestoreJourneyId | undefined {
  switch (value) {
    case 'first_run_restore':
    case 'empty_device_restore':
    case 'picker_restore':
    case 'settings_restore':
      return value;
    default:
      return undefined;
  }
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
  const [probedWorkplace, setProbedWorkplace] = useState<{
    id: WorkplaceId;
    workplace: PlainWorkplace | null;
  } | null>(null);
  const [creationOpeningTarget, setCreationOpeningTarget] = useState<CreationOpeningTarget | null>(
    null,
  );
  const creationOpeningCoordinator = useMemo<CreationOpeningCoordinatorValue>(
    () => ({
      target: creationOpeningTarget,
      request: id => setCreationOpeningTarget({ id }),
      markValidated: (id, workplace) => {
        setCreationOpeningTarget(current =>
          current?.id === id ? { id, validatedWorkplace: workplace } : current,
        );
      },
      markCommitted: id => {
        setCreationOpeningTarget(current =>
          current?.id === id && current.validatedWorkplace
            ? { ...current, committed: true }
            : current,
        );
      },
      clear: id => setCreationOpeningTarget(current => (current?.id === id ? null : current)),
    }),
    [creationOpeningTarget],
  );
  const resolution = useMemo(() => {
    const retry = () => {
      setFailedPointerRepairId(null);
      setRetryToken(token => token + 1);
    };
    if (
      creationOpeningTarget?.validatedWorkplace &&
      activeWorkplaceId === creationOpeningTarget.id
    ) {
      return {
        kind: 'open' as const,
        workplaceId: creationOpeningTarget.id,
        persistAsActive: false,
        workplace: creationOpeningTarget.validatedWorkplace,
      };
    }
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
    const workplace = discovery.workplaces.find(item => item.id === next.workplaceId);
    if (workplace) return { ...next, workplace };
    const probe = probedWorkplace?.id === next.workplaceId ? probedWorkplace : undefined;
    if (probe?.workplace) return { ...next, workplace: probe.workplace };
    if (probe && !probe.workplace) {
      if (discovery.workplaces.length === 0) {
        return { kind: 'setup' as const, journeyId: 'add_workplace' as const };
      }
      return { kind: 'picker' as const, workplaces: discovery.workplaces };
    }
    return { kind: 'loading' as const, retry };
  }, [
    activeWorkplaceId,
    deviceClaimed,
    setupDraft,
    discovery.error,
    discovery.loading,
    discovery.workplaces,
    isInitialized,
    probedWorkplace,
    creationOpeningTarget,
  ]);

  useEffect(() => {
    if (
      !creationOpeningTarget?.committed ||
      activeWorkplaceId !== creationOpeningTarget.id ||
      hasBlockingSetupDraft(setupDraft) ||
      (!discovery.workplaces.some(workplace => workplace.id === creationOpeningTarget.id) &&
        !(probedWorkplace?.id === creationOpeningTarget.id && probedWorkplace.workplace))
    ) {
      return;
    }
    // Clear the transient route exception after the externally committed workplace is visible.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCreationOpeningTarget(current =>
      current?.id === creationOpeningTarget.id ? null : current,
    );
  }, [activeWorkplaceId, creationOpeningTarget, discovery.workplaces, probedWorkplace, setupDraft]);

  useEffect(() => {
    if (!isInitialized || discovery.loading || discovery.error || !activeWorkplaceId) return;
    if (discovery.workplaces.some(workplace => workplace.id === activeWorkplaceId)) return;
    if (probedWorkplace?.id === activeWorkplaceId) return;
    let cancelled = false;
    void workplaceService.findPlainWorkplace(activeWorkplaceId).then(workplace => {
      if (cancelled) return;
      setProbedWorkplace({ id: activeWorkplaceId, workplace });
    });
    return () => {
      cancelled = true;
    };
  }, [
    activeWorkplaceId,
    discovery.error,
    discovery.loading,
    discovery.workplaces,
    isInitialized,
    probedWorkplace,
  ]);

  const state = useMemo<LaunchCoordinatorState>(() => {
    if (
      resolution.kind === 'open' &&
      resolution.persistAsActive &&
      failedPointerRepairId !== resolution.workplaceId
    ) {
      return { kind: 'loading', retry: () => setRetryToken(token => token + 1) };
    }
    if (resolution.kind === 'setup' && hasBlockingSetupDraft(setupDraft)) {
      return { ...resolution, hasBlockingDraft: true };
    }
    return resolution;
  }, [failedPointerRepairId, resolution, setupDraft]);

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
    const journeyId = restoreJourneyId(resolution.journeyId);
    if (!journeyId) return;
    if (loadSetupDraft()) return;
    saveSetupDraft(createSetupDraft(journeyId, asWorkplaceId(generator())));
  }, [resolution]);

  return (
    <CreationOpeningCoordinatorProvider value={creationOpeningCoordinator}>
      <LaunchCoordinatorContext.Provider value={state}>
        {children}
      </LaunchCoordinatorContext.Provider>
    </CreationOpeningCoordinatorProvider>
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
  const { isRestartRequired, isResetInProgress } = useAppRestart();
  const hasGateChildren = gateChildren !== undefined && gateChildren !== null;
  const router = useRouter();
  const pathname = usePathname();
  const routeParams = useLocalSearchParams<{
    journey?: string | string[];
    context?: string | string[];
    origin?: string | string[];
  }>();
  const routeJourney = Array.isArray(routeParams.journey)
    ? routeParams.journey[0]
    : routeParams.journey;
  const routeContext = Array.isArray(routeParams.context)
    ? routeParams.context[0]
    : routeParams.context;
  const routeOrigin = Array.isArray(routeParams.origin)
    ? routeParams.origin[0]
    : routeParams.origin;
  const creationEntry = creationLaunchEntry(state, routeContext);
  const {
    deleteWorkplace,
    isTransitioning,
    onCommittedWorkplace,
    pendingDeletionId,
    switchWorkplace,
    transitionError,
    transitionToWorkplace,
    transitionToWorkplaceStrict,
  } = useWorkplaceTransitions(state);
  const creationOpening = useCreationOpeningCoordinator();
  const openCreatedWorkplace = React.useCallback(
    async (id: WorkplaceId) => {
      if (!id || typeof id !== 'string' || !id.trim()) {
        throw new Error('A created workplace id is required.');
      }
      creationOpening.request(id);
      try {
        await transitionToWorkplaceStrict(
          id,
          state.kind === 'open' ? state.workplaceId : undefined,
          {
            rejectOnError: true,
            onTargetValidated: workplace => creationOpening.markValidated(id, workplace),
            onTransitionCommitted: () => router.replace('/(tabs)'),
          },
        );
        creationOpening.markCommitted(id);
      } catch (error) {
        creationOpening.clear(id);
        throw error;
      }
    },
    [creationOpening, router, state, transitionToWorkplaceStrict],
  );
  const returnToWorkplacePicker = React.useCallback(() => {
    preferences.device.setActiveWorkplaceId(undefined);
    AppNavigation.toDashboard();
  }, []);

  const isPrivacyPolicyAcknowledged = useSyncExternalStore(
    subscribeToPrivacyPolicyAcknowledgement,
    hasAcknowledgedCurrentPrivacyPolicy,
    hasAcknowledgedCurrentPrivacyPolicy,
  );
  const { isWidgetWorkplaceSwitchPending } = useWidgetWorkplaceIntent(
    state,
    transitionToWorkplace,
    isPrivacyPolicyAcknowledged,
  );
  const privacyRedirectInFlight = React.useRef(false);

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
      // The render path below owns setup redirects whenever gateChildren is present.
      // Running router.replace here as well can remount a just-created first-run
      // session and make it look resumable on a fresh install.
      if (hasGateChildren) return;
      if (state.unreadable) return;
      if (state.journeyId === 'first_run' || state.journeyId === 'add_workplace') {
        if (!state.hasBlockingDraft && restoreJourneyId(routeJourney ?? '')) return;
        const context =
          state.journeyId === 'first_run' ? 'unregistered_device' : 'registered_empty_device';
        const entryHref =
          state.journeyId === 'first_run'
            ? firstRunCreationHref(routeOrigin ?? pathname)
            : workplaceCreationHref({
                context: 'registered_empty_device',
                origin: routeOrigin ?? pathname,
              });
        if (
          pathname !== '/onboarding' ||
          routeJourney !== state.journeyId ||
          routeContext !== context
        ) {
          router.replace(entryHref);
        }
      } else if (shouldRedirectSetupToEntry(state.journeyId, pathname)) {
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
  }, [
    isPrivacyPolicyAcknowledged,
    isWidgetWorkplaceSwitchPending,
    pathname,
    routeContext,
    routeJourney,
    routeOrigin,
    router,
    state,
    hasGateChildren,
  ]);

  if (isResetInProgress) {
    return <LoadingView loading text="Resetting all data…" />;
  }
  if (isRestartRequired) return <RestartRequiredScreen />;

  if (state.kind === 'open') {
    if (pendingDeletionId) {
      return <LoadingView loading text={AppConfig.strings.settings.workplacePicker.switching} />;
    }
    return (
      <View style={styles.workplaceContent}>
        <WorkplaceProvider
          targetWorkplaceId={state.workplaceId}
          initialWorkplace={state.workplace}
          onSwitchWorkplace={switchWorkplace}
          onDeleteWorkplace={deleteWorkplace}
          onCommittedWorkplace={onCommittedWorkplace}
          isSwitchingWorkplace={isTransitioning}
          workplaceSwitchError={transitionError}
        >
          <CreationLaunchProvider
            value={{ openCreatedWorkplace, returnToWorkplacePicker, entry: creationEntry }}
          >
            {children}
          </CreationLaunchProvider>
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
    if (state.journeyId === 'first_run') {
      return <Redirect href={firstRunCreationHref('launch_gate')} />;
    }
    if (state.journeyId === 'add_workplace') {
      return (
        <Redirect
          href={workplaceCreationHref({
            context: 'registered_empty_device',
            origin: 'launch_gate',
          })}
        />
      );
    }
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
    return (
      <CreationLaunchProvider
        value={{ openCreatedWorkplace, returnToWorkplacePicker, entry: creationEntry }}
      >
        {gateChildren}
      </CreationLaunchProvider>
    );
  }
  if (state.kind === 'picker') {
    return (
      <WorkplacePicker
        workplaces={state.workplaces}
        transitionError={transitionError}
        isTransitioning={isTransitioning}
        onSelect={id => void transitionToWorkplace(id)}
        onCreate={() => AppNavigation.toAddWorkplace({ context: 'workplace_picker', origin: '/' })}
        onImport={() =>
          router.replace({ pathname: '/onboarding', params: { journey: 'picker_restore' } })
        }
      />
    );
  }
  if (state.kind === 'setup' && state.journeyId === 'first_run') {
    return <Redirect href={firstRunCreationHref('launch_gate')} />;
  }
  if (state.kind === 'setup' && state.journeyId === 'add_workplace') {
    return (
      <Redirect
        href={workplaceCreationHref({ context: 'registered_empty_device', origin: 'launch_gate' })}
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
