import { Icon, AppButton, AppCard, AppIcon, AppText } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { BackupScopeSheet } from '@/src/features/app/BackupScopeSheet';
import { Box, Stack } from '@/src/design-system';
import { AppConfig } from '@/src/constants/app-config';
import { Size } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservable } from '@/src/hooks/useObservable';
import { workplaceService } from '@/src/services/WorkplaceService';
import type { BackupScope } from '@/src/services/export';
import { preferences } from '@/src/services/preferences';
import type { WorkplaceId } from '@/src/types/ids';
import { appUpdateService } from '@/src/services/update/appUpdateService';
import { exportUpdateBackup } from '@/src/services/export';
import { updateInsightService } from '@/src/services/update/updateInsightService';
import { toast } from '@/src/utils/alerts';
import { readE2eLaunchConfig } from '@/src/testing/e2eLaunchArgs';
import { AppState, StyleSheet, TouchableOpacity } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function isE2eAvailableNotice(): boolean {
  return (
    process.env.EXPO_PUBLIC_E2E === '1' &&
    (readE2eLaunchConfig()?.updateGateMode ?? process.env.EXPO_PUBLIC_UPDATE_GATE_E2E) ===
      'available'
  );
}

export function UpdateGate({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(
    appUpdateService.subscribe,
    appUpdateService.getSnapshot,
    appUpdateService.getSnapshot,
  );
  const check = appUpdateService.check;
  const [hiddenProgressTarget, setHiddenProgressTarget] = useState<number | null>(null);
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [isExporting, setIsExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [isChangelogVisible, setIsChangelogVisible] = useState(false);
  const [isBackupScopeVisible, setIsBackupScopeVisible] = useState(false);
  const [backupScope, setBackupScope] = useState<BackupScope>('all');
  const [selectedWorkplaceIds, setSelectedWorkplaceIds] = useState<string[]>([]);
  const { data: workplaces = [] } = useObservable(
    () => workplaceService.observeAllWorkplaces(),
    [],
    [],
  );
  const notifiedAvailableUpdate = useRef<string | null>(null);

  const update = useCallback(() => {
    void appUpdateService.update();
  }, []);

  useEffect(() => {
    if (!state.error) return;
    const strings = AppConfig.strings.update;
    toast.error(
      state.error === 'unsaved'
        ? strings.finishEditing
        : state.error === 'install'
          ? strings.installFailed
          : strings.unavailable,
    );
  }, [state.error]);

  useEffect(() => {
    const disconnect = appUpdateService.connect();
    const initialCheck = setTimeout(() => void check(), 0);
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') void check();
    });
    return () => {
      clearTimeout(initialCheck);
      subscription.remove();
      disconnect();
    };
  }, [check]);

  const ready = state.phase === 'downloaded';
  useEffect(() => {
    const notice = state.notice;
    if (state.access !== 'allowed' || !notice?.latestBuild || (state.phase !== 'idle' && !ready))
      return;
    updateInsightService.publishAvailableUpdate(notice, ready);
    const noticeKey = `${notice.latestBuild}:${ready ? 'ready' : 'available'}`;
    if (
      notifiedAvailableUpdate.current === noticeKey ||
      updateInsightService.isNoticeDismissed(notice, ready)
    )
      return;
    const timeoutId = setTimeout(() => {
      notifiedAvailableUpdate.current = noticeKey;
      toast.info(
        ready
          ? AppConfig.strings.update.ready
          : (notice.availableMessage ?? AppConfig.strings.update.availableMessage),
        {
          key: 'app-update',
          duration: isE2eAvailableNotice() ? 120000 : undefined,
          dismissible: true,
          action: {
            label: ready ? AppConfig.strings.update.restart : AppConfig.strings.update.updateNow,
            onPress: update,
          },
          onDismiss: () => updateInsightService.dismissAvailableUpdate(notice, ready),
        },
      );
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [ready, state.access, state.notice, state.phase, update]);

  useEffect(() => {
    if (!state.notice || state.access === 'required') updateInsightService.clearAvailableUpdate();
    if (state.access === 'required') void SplashScreen.hideAsync();
  }, [state.access, state.notice, state.phase]);

  const exportBackup = async () => {
    setExportFailed(false);
    setIsExporting(true);
    try {
      await exportUpdateBackup(
        backupScope,
        selectedWorkplaceIds.map(id => id as WorkplaceId),
      );
    } catch {
      setExportFailed(true);
    } finally {
      setIsExporting(false);
    }
  };

  const openBackupScope = () => {
    setSelectedWorkplaceIds(ids =>
      ids.length > 0 ? ids : workplaces.map(workplace => workplace.id),
    );
    setIsBackupScopeVisible(true);
  };

  if (state.access === 'allowed') {
    return (
      <Box flex={1}>
        {children}
        {hiddenProgressTarget !== state.notice?.latestBuild &&
          (ready || state.phase === 'downloading' || state.phase === 'installing') && (
            <Box
              padding="md"
              style={{ paddingBottom: Math.max(insets.bottom, 16) }}
              background="surfaceSecondary"
              testID="update-download-status"
            >
              <AppText>
                {ready
                  ? AppConfig.strings.update.ready
                  : state.phase === 'installing'
                    ? AppConfig.strings.update.installing
                    : AppConfig.strings.update.downloading(state.progress)}
              </AppText>
              {ready && (
                <Stack gap="sm">
                  <AppButton testID="update-restart" onPress={update}>
                    {AppConfig.strings.update.restart}
                  </AppButton>
                  <AppButton
                    testID="update-later"
                    variant="ghost"
                    onPress={() => {
                      setHiddenProgressTarget(state.notice?.latestBuild ?? null);
                      if (state.notice)
                        updateInsightService.dismissAvailableUpdate(state.notice, true);
                    }}
                  >
                    {AppConfig.strings.update.later}
                  </AppButton>
                </Stack>
              )}
            </Box>
          )}
      </Box>
    );
  }

  if (state.access === 'checking') {
    return (
      <Box flex={1} background="background" justifyContent="center" alignItems="center">
        <AppText variant="body" color="secondary">
          {AppConfig.strings.update.checking}
        </AppText>
      </Box>
    );
  }

  const policy = state.policy;
  if (!policy) return <>{children}</>;

  return (
    <Box flex={1} background="background" justifyContent="center" alignItems="center" padding="xl">
      <AppCard paddingSize="lg" radius="r3" elevation="md" style={styles.card}>
        <Stack gap="xl" alignItems="center">
          <Box
            width={72}
            height={72}
            borderRadius="full"
            background="primary"
            backgroundOpacity="soft"
            alignItems="center"
            justifyContent="center"
          >
            <AppIcon
              name={Icon.Sparkles}
              size={Size.iconLg}
              color={theme.primary}
              strokeWidth={1.8}
            />
          </Box>

          <Stack gap="sm" alignItems="center">
            <AppText testID="update-required-title" variant="heading" align="center">
              {AppConfig.strings.update.requiredTitle}
            </AppText>
            <AppText variant="body" color="secondary" align="center">
              {policy.message || AppConfig.strings.update.requiredSubtitle}
            </AppText>
          </Stack>

          {state.phase !== 'idle' && (
            <AppText
              testID="update-download-status"
              variant="caption"
              color="secondary"
              align="center"
            >
              {ready
                ? AppConfig.strings.update.ready
                : state.phase === 'installing'
                  ? AppConfig.strings.update.installing
                  : AppConfig.strings.update.downloading(state.progress)}
            </AppText>
          )}

          {!!policy.changelog?.length && (
            <Box
              as={TouchableOpacity}
              testID="update-view-changelog"
              accessibilityRole="button"
              accessibilityLabel={AppConfig.strings.update.viewChangelog}
              onPress={() => setIsChangelogVisible(true)}
              flexDirection="row"
              alignItems="center"
              width="100%"
              padding="lg"
              borderRadius="r2"
              background="surfaceSecondary"
              gap="md"
            >
              <AppIcon name={Icon.Document} size={Size.iconMd} color={theme.primary} />
              <Stack gap="xs" flex={1}>
                <AppText weight="semibold">{AppConfig.strings.update.viewChangelog}</AppText>
                <AppText variant="caption" color="secondary">
                  {policy.changelog.length} update highlight
                  {policy.changelog.length === 1 ? '' : 's'}
                </AppText>
              </Stack>
              <AppIcon name={Icon.ArrowRight} size={Size.iconSm} color={theme.textSecondary} />
            </Box>
          )}

          <Stack gap="md" width="100%">
            <AppButton
              testID="update-now"
              size="lg"
              loading={state.phase === 'starting' || state.phase === 'installing'}
              disabled={state.phase === 'downloading'}
              onPress={update}
            >
              {ready ? AppConfig.strings.update.restart : AppConfig.strings.update.updateNow}
            </AppButton>
            <AppButton
              testID="update-export-backup"
              variant="secondary"
              loading={isExporting}
              onPress={openBackupScope}
            >
              {isExporting
                ? AppConfig.strings.update.exportingBackup
                : AppConfig.strings.update.exportBackup}
            </AppButton>
          </Stack>

          {exportFailed && (
            <AppText variant="caption" color="secondary" align="center">
              {AppConfig.strings.update.exportFailed}
            </AppText>
          )}

          <Stack gap="sm" alignItems="center">
            <AppText variant="caption" color="secondary" align="center">
              {AppConfig.strings.update.exportHint}
            </AppText>
            <AppButton variant="ghost" size="sm" onPress={() => void check()}>
              {AppConfig.strings.update.retry}
            </AppButton>
          </Stack>

          {state.error && (
            <AppText
              variant="caption"
              color="secondary"
              align="center"
              style={{ color: theme.textSecondary }}
            >
              {state.error === 'install'
                ? AppConfig.strings.update.installFailed
                : AppConfig.strings.update.unavailable}
            </AppText>
          )}
        </Stack>
      </AppCard>
      <ModalSurface
        visible={isChangelogVisible}
        title={AppConfig.strings.update.changelogTitle}
        onClose={() => setIsChangelogVisible(false)}
        fixedHeight={false}
        maxHeightPercent={76}
        accessibilityCloseLabel="Close changelog"
        closeTestID="update-close-changelog"
      >
        <Stack gap="md">
          {policy.changelog?.map((item, index) => (
            <AppText
              key={`${index}-${item}`}
              testID={`update-changelog-item-${index}`}
              variant="body"
              color="secondary"
            >
              {'• '}
              {item}
            </AppText>
          ))}
        </Stack>
      </ModalSurface>
      <BackupScopeSheet
        visible={isBackupScopeVisible}
        workplaces={workplaces}
        activeWorkplaceId={preferences.device.activeWorkplaceId ?? workplaces[0]?.id ?? ''}
        scope={backupScope}
        selectedWorkplaceIds={selectedWorkplaceIds}
        onScopeChange={setBackupScope}
        onSelectedWorkplaceIdsChange={setSelectedWorkplaceIds}
        onClose={() => setIsBackupScopeVisible(false)}
        onConfirm={() => {
          setIsBackupScopeVisible(false);
          void exportBackup();
        }}
      />
    </Box>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 380,
  },
});
