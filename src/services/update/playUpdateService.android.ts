import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type SpInAppUpdates from 'sp-react-native-in-app-updates';
import {
  ANDROID_APPLICATION_ID,
  parseBuild,
  PlayInstallStatus,
  type PlayUpdateAdapter,
  type PlayUpdateEvent,
} from './playUpdateTypes';

const listeners = new Set<(event: PlayUpdateEvent) => void>();
let client: SpInAppUpdates | null = null;

function emit(event: PlayUpdateEvent) {
  listeners.forEach(listener => listener(event));
}

async function getClient(): Promise<SpInAppUpdates | null> {
  if (
    Platform.OS !== 'android' ||
    Constants.executionEnvironment === 'storeClient' ||
    Application.applicationId !== ANDROID_APPLICATION_ID ||
    parseBuild(Application.nativeBuildVersion) === null ||
    process.env.EXPO_PUBLIC_E2E === '1'
  ) {
    return null;
  }
  if (!client) {
    try {
      // Metro's lazy require keeps the enforcing TurboModule behind the eligibility guard.
      const { default: Updater }: typeof import('sp-react-native-in-app-updates') =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('sp-react-native-in-app-updates');
      client = new Updater(false);
      client.addStatusUpdateListener(event => {
        const total = Number(event.totalBytesToDownload);
        const downloaded = Number(event.bytesDownloaded);
        const progress =
          total > 0 && Number.isFinite(total) && Number.isFinite(downloaded)
            ? Math.max(0, Math.min(1, downloaded / total))
            : undefined;
        emit({ kind: 'status', status: Number(event.status), progress });
      });
      client.addIntentSelectionListener(result => {
        if (Number(result) === PlayInstallStatus.Cancelled) emit({ kind: 'cancelled' });
        else if (Number(result) === PlayInstallStatus.Installed) emit({ kind: 'accepted' });
        else if (Number(result) === PlayInstallStatus.Failed)
          emit({ kind: 'status', status: PlayInstallStatus.Failed });
        // RESULT_OK means acceptance, not successful installation.
      });
    } catch {
      client?.dispose();
      client = null;
    }
  }
  return client;
}

export const playUpdateService: PlayUpdateAdapter = {
  async check() {
    const client = await getClient();
    if (!client) return null;
    const request = client.checkNeedsUpdate({
      curVersion: String(Application.nativeBuildVersion),
      customVersionComparator: (store, installed) => {
        const a = parseBuild(store),
          b = parseBuild(installed);
        if (a === null || b === null) throw new Error('Invalid native build number');
        return a > b ? 1 : a < b ? -1 : 0;
      },
    });
    // A stuck Play task must not prevent a user-triggered store fallback or later checks.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Play update check timed out')), 5000);
      }),
    ]).finally(() => clearTimeout(timeout));
    const info = result.other;
    if (
      !info ||
      !('versionCode' in info) ||
      (info.packageName && info.packageName !== ANDROID_APPLICATION_ID)
    )
      return null;
    const build = parseBuild(info.versionCode);
    if (build === null) return null;
    return {
      build,
      availability:
        info.updateAvailability === 2
          ? 'available'
          : info.updateAvailability === 3
            ? 'in-progress'
            : 'none',
      immediateAllowed: info.isImmediateUpdateAllowed,
      flexibleAllowed: info.isFlexibleUpdateAllowed,
      installStatus: Number(info.installStatus),
    };
  },
  async start(mode) {
    const client = await getClient();
    if (!client) throw new Error('Native updates are unavailable');
    await client.startUpdate({ updateType: mode === 'immediate' ? 1 : 0 });
  },
  async install() {
    const client = await getClient();
    if (!client) throw new Error('Native updates are unavailable');
    await client.installUpdate();
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        client?.dispose();
        client = null;
      }
    };
  },
};
