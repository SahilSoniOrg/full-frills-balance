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
import { workplaceService } from '@/src/services/WorkplaceService';
import { applyDeviceRecovery, decideDeviceRecovery } from '@/src/services/launch/deviceRecovery';
import { resolveLaunchGate } from '@/src/services/launch/launchResolver';
import {
  hasAcknowledgedCurrentPrivacyPolicy,
  subscribeToPrivacyPolicyAcknowledgement,
} from '@/src/services/legal/privacyPolicyAcceptance';
import { preferences } from '@/src/services/preferences';
import { isSetupJourneyId } from '@/src/services/setup/setupDraftIdentity';
import type { WorkplaceId } from '@/src/types/ids';
import type { PlainWorkplace } from '@/src/types/plainDtos';
import { logger } from '@/src/utils/logger';
import { Redirect, usePathname, useRouter } from 'expo-router';
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
    const workplace = discovery.workplaces.find(item => item.id === next.workplaceId);
    if (!workplace) {
      return { kind: 'loading' as const, retry };
    }
    return { ...next, workplace };
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
  const {
    deleteWorkplace,
    isTransitioning,
    onCommittedWorkplace,
    pendingDeletionId,
    switchWorkplace,
    transitionError,
    transitionToWorkplace,
  } = useWorkplaceTransitions(state);
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
