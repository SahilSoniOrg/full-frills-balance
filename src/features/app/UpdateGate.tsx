import { AppButton, AppText } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { AppConfig } from '@/src/constants/app-config';
import { useTheme } from '@/src/hooks/use-theme';
import {
  checkVersion,
  isVersionPolicyConfigured,
} from '@/src/services/update/versionPolicyService';
import { exportCurrentWorkplaceBackup } from '@/src/services/export';
import type { VersionPolicy } from '@/src/services/update/types';
import { openStoreUrl } from '@/src/services/update/storeLinking';
// Register update insights before the Hub can observe supplemental providers.
import '@/src/services/update/updateInsightService';
import { toast } from '@/src/utils/alerts';
import {
  clearAvailableUpdate,
  dismissAvailableUpdate,
  publishAvailableUpdate,
} from '@/src/services/update/updateAvailabilityStore';
import { AppState, Platform, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from 'react';

const E2E_AVAILABLE_NOTICE =
  process.env.EXPO_PUBLIC_E2E === '1' && process.env.EXPO_PUBLIC_UPDATE_GATE_E2E === 'available';

type GateState =
  | { kind: 'checking' }
  | { kind: 'allowed'; available?: VersionPolicy }
  | { kind: 'required'; policy: VersionPolicy }
  | { kind: 'error'; policy: VersionPolicy };

export function UpdateGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>(() =>
    Platform.OS === 'web' || !isVersionPolicyConfigured()
      ? { kind: 'allowed' }
      : { kind: 'checking' },
  );
  const { theme } = useTheme();
  const [isExporting, setIsExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const notifiedAvailableUpdate = useRef<string | null>(null);

  const check = useCallback(async () => {
    if (Platform.OS === 'web' || !isVersionPolicyConfigured()) {
      setState({ kind: 'allowed' });
      return;
    }
    setState(previous =>
      previous.kind === 'required' || previous.kind === 'error' ? previous : { kind: 'checking' },
    );
    try {
      const result = await checkVersion();
      setState(
        result.kind === 'required'
          ? { kind: 'required', policy: result.policy }
          : { kind: 'allowed', available: result.available },
      );
      if (result.kind === 'allowed' && result.available) publishAvailableUpdate(result.available);
      else clearAvailableUpdate();
    } catch {
      // A network outage must not brick a device that has never received a policy.
      setState(previous => (previous.kind === 'required' ? previous : { kind: 'allowed' }));
    }
  }, []);

  const openStore = useCallback(
    async (policy: VersionPolicy) => {
      try {
        await openStoreUrl(policy.storeUrl);
      } catch {
        if (state.kind === 'required' || state.kind === 'error') {
          setState({ kind: 'error', policy });
        } else {
          toast.error(AppConfig.strings.update.unavailable);
        }
      }
    },
    [state.kind],
  );

  useEffect(() => {
    const initialCheck = setTimeout(() => void check(), 0);
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') void check();
    });
    return () => {
      clearTimeout(initialCheck);
      subscription.remove();
    };
  }, [check]);

  useEffect(() => {
    if (state.kind !== 'allowed' || !state.available?.latestBuild) return;
    const noticeKey = `${state.available.latestBuild}:${state.available.storeUrl}`;
    if (notifiedAvailableUpdate.current === noticeKey) return;
    notifiedAvailableUpdate.current = noticeKey;

    const notice = state.available;
    const timeoutId = setTimeout(() => {
      toast.info(notice.availableMessage ?? AppConfig.strings.update.availableMessage, {
        duration: E2E_AVAILABLE_NOTICE ? 120000 : undefined,
        dismissible: true,
        action: {
          label: AppConfig.strings.update.updateNow,
          onPress: () => void openStore(notice),
        },
        onDismiss: () => dismissAvailableUpdate(notice),
      });
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [openStore, state]);

  useEffect(() => {
    if (state.kind === 'required' || state.kind === 'error') {
      void SplashScreen.hideAsync();
    }
  }, [state.kind]);

  const exportBackup = async () => {
    setExportFailed(false);
    setIsExporting(true);
    try {
      await exportCurrentWorkplaceBackup();
    } catch {
      setExportFailed(true);
    } finally {
      setIsExporting(false);
    }
  };

  if (state.kind === 'allowed') return <>{children}</>;

  if (state.kind === 'checking') {
    return (
      <Box flex={1} background="background" justifyContent="center" alignItems="center">
        <AppText variant="body" color="secondary">
          {AppConfig.strings.update.checking}
        </AppText>
      </Box>
    );
  }

  return (
    <Box flex={1} background="background" justifyContent="center" alignItems="center" padding="xl">
      <Stack gap="lg" alignItems="center" style={styles.content}>
        <AppText testID="update-required-title" variant="heading" align="center">
          {AppConfig.strings.update.requiredTitle}
        </AppText>
        <AppText variant="body" color="secondary" align="center">
          {state.policy.message || AppConfig.strings.update.requiredSubtitle}
        </AppText>
        <AppText variant="caption" color="secondary" align="center">
          {AppConfig.strings.update.exportHint}
        </AppText>
        <AppButton
          testID="update-export-backup"
          variant="secondary"
          loading={isExporting}
          onPress={() => void exportBackup()}
        >
          {isExporting
            ? AppConfig.strings.update.exportingBackup
            : AppConfig.strings.update.exportBackup}
        </AppButton>
        {exportFailed && (
          <AppText variant="caption" color="secondary" align="center">
            {AppConfig.strings.update.exportFailed}
          </AppText>
        )}
        <AppButton testID="update-now" onPress={() => void openStore(state.policy)}>
          {AppConfig.strings.update.updateNow}
        </AppButton>
        <AppButton variant="ghost" onPress={() => void check()}>
          {AppConfig.strings.update.retry}
        </AppButton>
        {state.kind === 'error' && (
          <AppText
            variant="caption"
            color="secondary"
            align="center"
            style={{ color: theme.textSecondary }}
          >
            {AppConfig.strings.update.unavailable}
          </AppText>
        )}
      </Stack>
    </Box>
  );
}

const styles = StyleSheet.create({ content: { maxWidth: 360 } });
