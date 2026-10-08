import { Alert } from 'react-native';
import type { AppUpdateDependencies } from '@/src/services/update/appUpdateService';
import {
  PlayInstallStatus,
  type PlayUpdateEvent,
  type PlayUpdateInfo,
} from '@/src/services/update/playUpdateTypes';
import { evaluateVersionPolicy } from '@/src/services/update/versionPolicyService';
import { isUpdateRestartBlocked } from '@/src/services/update/updateRestartGuard';
import { readE2eLaunchConfig } from './e2eLaunchArgs';
import { assertE2eHarnessEnabled } from './e2eRuntimeGate';

/** Simulates only the store transport; production coordinator and UI run unchanged. */
export function createE2eAppUpdateDependencies(): AppUpdateDependencies | null {
  const config = readE2eLaunchConfig();
  if (!config?.updateGateMode) return null;
  assertE2eHarnessEnabled();
  const flow = config.updateFlow ?? 'download';
  let installedBuild = 160;
  let status =
    flow === 'downloaded' || flow === 'install-failure'
      ? PlayInstallStatus.Downloaded
      : PlayInstallStatus.Unknown;
  let installAttempts = 0;
  const listeners = new Set<(event: PlayUpdateEvent) => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const emit = (event: PlayUpdateEvent) => listeners.forEach(listener => listener(event));
  const schedule = (delay: number, action: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      action();
    }, delay);
    timers.add(timer);
  };
  const policy = {
    minimumBuild: config.updateGateMode === 'required' ? 161 : 159,
    latestBuild: 161,
    storeUrl: 'https://example.com/full-frills-balance-update',
    message: 'Update this version to keep using your books.',
    availableMessage: 'A newer version of Full Frills Balance is available.',
    changelog: [
      'Android updates can download while you keep using the app.',
      'Restart when ready; unsaved edits stay protected.',
    ],
  };
  return {
    currentBuild: () => installedBuild,
    policyCheck: async () => evaluateVersionPolicy(policy, installedBuild),
    restartBlocked: isUpdateRestartBlocked,
    openStore: async () => {
      Alert.alert(
        'Mock store fallback',
        'The native update could not start. The real app would open its store listing here.',
      );
    },
    play: {
      check: async (): Promise<PlayUpdateInfo> => ({
        build: 161,
        availability: installedBuild < 161 ? 'available' : 'none',
        flexibleAllowed: true,
        immediateAllowed: true,
        installStatus: status,
      }),
      start: async () => {
        if (flow === 'failure') throw new Error('Mock native launch failure');
        Alert.alert(
          'Mock Play update',
          'Demo only. No store download or installation will occur.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                status = PlayInstallStatus.Cancelled;
                emit({ kind: 'cancelled' });
              },
            },
            {
              text: 'Download',
              onPress: () => {
                status = PlayInstallStatus.Downloading;
                emit({ kind: 'accepted' });
                emit({ kind: 'status', status, progress: 0 });
                for (const [delay, progress] of [
                  [1500, 0.2],
                  [3500, 0.45],
                  [5500, 0.7],
                  [7500, 1],
                ]) {
                  schedule(delay, () => {
                    status =
                      progress === 1 ? PlayInstallStatus.Downloaded : PlayInstallStatus.Downloading;
                    emit({ kind: 'status', status, progress });
                  });
                }
              },
            },
          ],
        );
      },
      install: async () => {
        if (flow === 'install-failure' && installAttempts++ === 0)
          throw new Error('Mock installation failure');
        emit({ kind: 'status', status: PlayInstallStatus.Installing });
        await new Promise<void>(resolve =>
          schedule(900, () => {
            installedBuild = 161;
            status = PlayInstallStatus.Installed;
            emit({ kind: 'status', status });
            resolve();
          }),
        );
      },
      subscribe: listener => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
          if (!listeners.size) {
            timers.forEach(clearTimeout);
            timers.clear();
          }
        };
      },
    },
  };
}
