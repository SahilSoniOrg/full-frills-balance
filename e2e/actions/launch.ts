import { device, element, by, waitFor } from 'detox';
import type { E2eSeedProfile } from '../utils/launchArgs';
import { E2E_AUTH_TOKEN } from '../utils/launchArgs';

export type LaunchOnboardedOptions = {
  seedProfile?: E2eSeedProfile;
  newInstance?: boolean;
  backupPath?: string;
  preserveData?: boolean;
  disableSynchronization?: boolean;
};

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
  await device.launchApp({
    newInstance: true,
    delete: true,
    permissions: { notifications: 'YES' },
    launchArgs: {
      e2eAuth: E2E_AUTH_TOKEN,
      e2eReset: '1',
    },
  });
  if (options.disableSynchronization) await device.disableSynchronization();
  if (!options.disableSynchronization) {
    await waitFor(element(by.id('onboarding-v2-you-input')))
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

export async function launchOnboardedApp(options: LaunchOnboardedOptions = {}): Promise<void> {
  const seedProfile = options.seedProfile ?? 'journal-ready';
  await device.launchApp({
    newInstance: options.newInstance ?? true,
    delete: !options.preserveData,
    permissions: { notifications: 'YES' },
    launchArgs: e2eLaunchArgs(seedProfile, options.backupPath),
  });
  if (options.disableSynchronization) await device.disableSynchronization();
  if (!options.disableSynchronization) {
    await waitForDashboard();
  }
}

export async function launchPickerApp(): Promise<void> {
  await device.launchApp({
    newInstance: true,
    delete: true,
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
  await device.launchApp({
    newInstance: true,
    delete: true,
    permissions: { notifications: 'YES' },
    launchArgs: e2eLaunchArgs('first-run-restore'),
  });
  if (options.disableSynchronization) await device.disableSynchronization();
}

export async function relaunchPreservingData(): Promise<void> {
  await device.terminateApp();
  await device.launchApp({
    newInstance: true,
    delete: false,
    permissions: { notifications: 'YES' },
    launchArgs: { e2eAuth: E2E_AUTH_TOKEN },
  });
  // Startup can legitimately keep native work pending; callers explicitly wait for their slice.
  await device.disableSynchronization();
}

export async function openWorkplaceCreation(): Promise<void> {
  await device.openURL({ url: 'fullfrillsbalance://onboarding?mode=full' });
  await waitFor(element(by.id('workplace-name-input')))
    .toBeVisible()
    .withTimeout(120000);
}
