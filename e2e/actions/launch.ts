import { device, element, by, waitFor } from 'detox';
import type { E2eSeedProfile } from '../utils/launchArgs';
import { E2E_AUTH_TOKEN } from '../utils/launchArgs';

export type LaunchOnboardedOptions = {
  seedProfile?: E2eSeedProfile;
  newInstance?: boolean;
};

function e2eLaunchArgs(seedProfile?: E2eSeedProfile): Record<string, string> {
  const args: Record<string, string> = {
    e2eAuth: E2E_AUTH_TOKEN,
    e2eReset: '1',
  };
  if (seedProfile) {
    args.e2eSeedProfile = seedProfile;
  }
  return args;
}

export async function launchFreshApp(): Promise<void> {
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
  await waitFor(element(by.id('onboarding-name-input')))
    .toBeVisible()
    .withTimeout(120000);
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
    delete: true,
    permissions: { notifications: 'YES' },
    launchArgs: e2eLaunchArgs(seedProfile),
  });
  await waitForDashboard();
}
