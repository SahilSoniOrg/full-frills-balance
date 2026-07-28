import { device, element, by, waitFor } from 'detox';
import type { E2eSeedProfile } from '../utils/launchArgs';
import { E2E_AUTH_TOKEN } from '../utils/launchArgs';

const METRO_URL = process.env.DETOX_METRO_URL ?? 'http://localhost:8081';
const DEV_CLIENT_URL = `exp+full-frills-balance://expo-development-client/?url=${encodeURIComponent(METRO_URL)}`;

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

async function connectDevClientIfNeeded(): Promise<void> {
  const candidates = [
    element(by.text(METRO_URL)),
    element(by.text(/https?:\/\/[^\s]+:8081/)),
    element(by.text('Full Frills Balance')),
    element(by.label('Full Frills Balance')),
  ];

  for (const el of candidates) {
    try {
      await waitFor(el).toBeVisible().withTimeout(8000);
      await el.tap();
      return;
    } catch {
      // try next selector
    }
  }
}

export async function launchFreshApp(): Promise<void> {
  await device.launchApp({
    newInstance: true,
    delete: true,
    permissions: { notifications: 'YES' },
    launchArgs: { e2eAuth: E2E_AUTH_TOKEN },
    url: DEV_CLIENT_URL,
  });
  await connectDevClientIfNeeded();
}

export async function launchOnboardedApp(options: LaunchOnboardedOptions = {}): Promise<void> {
  const seedProfile = options.seedProfile ?? 'journal-ready';
  await device.launchApp({
    newInstance: options.newInstance ?? true,
    delete: true,
    permissions: { notifications: 'YES' },
    launchArgs: e2eLaunchArgs(seedProfile),
    url: DEV_CLIENT_URL,
  });
  await connectDevClientIfNeeded();
}
