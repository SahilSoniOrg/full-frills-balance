import { device, element, by, waitFor } from 'detox';
import type { E2eSeedProfile, E2eUpdateFlow } from '@/src/testing/e2eConstants';
import { E2E_AUTH_TOKEN } from '@/src/testing/e2eConstants';

export type LaunchOnboardedOptions = {
  seedProfile?: E2eSeedProfile;
  newInstance?: boolean;
  backupPath?: string;
  preserveData?: boolean;
  disableSynchronization?: boolean;
};

/** Linux cloud runs set this so a slow emulator `pm clear`s instead of reinstalling. */
function dataResetOptions(preserveData = false): { delete: boolean; resetAppState?: boolean } {
  if (preserveData) {
    return { delete: false };
  }
  if (process.env.DETOX_REUSE_INSTALLED_APP === '1') {
    return { delete: false, resetAppState: true };
  }
  return { delete: true };
}

function isActivityIdleTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('within 45000 milliseconds') || message.includes('has not gone idle');
}

/**
 * AndroidX startActivitySync gives the main thread 45s to go idle.
 * Software emulation can miss that on a cold start even when the next
 * launch of the same process succeeds. The retry keeps the same launch
 * args and does not clear data again.
 */
export async function launchAppToleratingIdleTimeout(
  params: Parameters<typeof device.launchApp>[0],
): Promise<void> {
  try {
    await device.launchApp(params);
  } catch (error) {
    if (device.getPlatform() !== 'android' || !isActivityIdleTimeout(error)) {
      throw error;
    }
    await device.launchApp({
      ...params,
      newInstance: true,
      delete: false,
      resetAppState: false,
    });
  }
}

function e2eLaunchArgs(seedProfile?: E2eSeedProfile, backupPath?: string): Record<string, string> {
  const args: Record<string, string> = {
    e2eAuth: E2E_AUTH_TOKEN,
    e2eReset: '1',
  };
  if (seedProfile) {
    args.e2eSeedProfile = seedProfile;
  }
  if (backupPath) args.e2eBackupPath = backupPath;
  return args;
}

export async function launchFreshApp(
  options: { disableSynchronization?: boolean } = {},
): Promise<void> {
  try {
    await device.terminateApp();
  } catch {
    // app may not be running
  }
  await launchAppToleratingIdleTimeout({
    newInstance: true,
    ...dataResetOptions(),
    permissions: { notifications: 'YES' },
    launchArgs: {
      e2eAuth: E2E_AUTH_TOKEN,
      e2eReset: '1',
    },
  });
  if (options.disableSynchronization) await device.disableSynchronization();
  if (!options.disableSynchronization) {
    await waitFor(element(by.id('onboarding-name-input')))
      .toBeVisible()
      .withTimeout(120000);
  }
}

export async function waitForDashboard(timeoutMs = 120000): Promise<void> {
  const screen = element(by.id('dashboard-screen'));
  try {
    await waitFor(screen).toBeVisible().withTimeout(15000);
    return;
  } catch {
    // RN New Arch: root testID can report visible in hierarchy but fail Detox visibility (overlays/animations).
    await waitFor(screen).toExist().withTimeout(timeoutMs);
    await waitFor(element(by.id('tab-dashboard')))
      .toBeVisible()
      .withTimeout(30000);
  }
}

export type E2eUpdateGateMode = 'required' | 'available';

export async function launchWithUpdateGate(
  mode: E2eUpdateGateMode,
  options: {
    flow?: E2eUpdateFlow;
    seedProfile?: E2eSeedProfile;
  } = {},
): Promise<void> {
  await launchAppToleratingIdleTimeout({
    newInstance: true,
    ...dataResetOptions(),
    permissions: { notifications: 'YES' },
    launchArgs: {
      e2eAuth: E2E_AUTH_TOKEN,
      e2eReset: '1',
      e2eSeedProfile: options.seedProfile ?? 'onboarded',
      e2eUpdateGateMode: mode,
      ...(options.flow ? { e2eUpdateFlow: options.flow } : {}),
    },
  });
}

export async function launchSeedProfileApp(
  seedProfile: E2eSeedProfile,
  options: {
    disableSynchronization?: boolean;
    newInstance?: boolean;
    delete?: boolean;
  } = {},
): Promise<void> {
  await launchAppToleratingIdleTimeout({
    newInstance: options.newInstance ?? true,
    ...(options.delete === false ? { delete: false as const } : dataResetOptions()),
    permissions: { notifications: 'YES' },
    launchArgs: e2eLaunchArgs(seedProfile),
  });
  if (options.disableSynchronization) await device.disableSynchronization();
}

export async function launchOnboardedApp(options: LaunchOnboardedOptions = {}): Promise<void> {
  const seedProfile = options.seedProfile ?? 'journal-ready';
  await launchAppToleratingIdleTimeout({
    newInstance: options.newInstance ?? true,
    ...dataResetOptions(Boolean(options.preserveData)),
    permissions: { notifications: 'YES' },
    launchArgs: e2eLaunchArgs(seedProfile, options.backupPath),
  });
  if (options.disableSynchronization) await device.disableSynchronization();
  if (!options.disableSynchronization) {
    await waitForDashboard();
  }
}

export async function launchPickerApp(): Promise<void> {
  await launchAppToleratingIdleTimeout({
    newInstance: true,
    ...dataResetOptions(),
    permissions: { notifications: 'YES' },
    launchArgs: e2eLaunchArgs('picker-ready'),
  });
  await waitFor(element(by.id('workplace-picker-screen')))
    .toBeVisible()
    .withTimeout(120000);
}

export async function launchRestoreResumeApp(
  options: { disableSynchronization?: boolean } = {},
): Promise<void> {
  try {
    await device.terminateApp();
  } catch {
    // app may not be running
  }
  await launchAppToleratingIdleTimeout({
    newInstance: true,
    ...dataResetOptions(),
    permissions: { notifications: 'YES' },
    launchArgs: e2eLaunchArgs('first-run-restore'),
  });
  if (options.disableSynchronization) await device.disableSynchronization();
}

export async function relaunchPreservingData(): Promise<void> {
  await device.terminateApp();
  await launchAppToleratingIdleTimeout({
    newInstance: true,
    delete: false,
    permissions: { notifications: 'YES' },
    launchArgs: { e2eAuth: E2E_AUTH_TOKEN },
  });
  // Startup can legitimately keep native work pending; callers explicitly wait for their slice.
  await device.disableSynchronization();
}

export async function relaunchSameInstance(): Promise<void> {
  await device.terminateApp();
  await launchAppToleratingIdleTimeout({
    newInstance: false,
    launchArgs: { e2eAuth: E2E_AUTH_TOKEN },
  });
}

export async function openWorkplaceCreation(): Promise<void> {
  await device.openURL({ url: 'fullfrillsbalance://onboarding?mode=full' });
  await waitFor(element(by.id('workplace-name-input')))
    .toBeVisible()
    .withTimeout(120000);
}
