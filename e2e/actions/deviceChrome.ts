import { execFileSync } from 'node:child_process';
import { by, device, element, waitFor } from 'detox';
import { E2E_AUTH_TOKEN } from '../../src/testing/e2eConstants';

async function dismissUpdatePrompt(): Promise<void> {
  const later = element(by.text('Later'));
  try {
    await waitFor(later).toBeVisible().withTimeout(8000);
    await later.tap();
  } catch {
    // The activity restart does not always surface the update prompt.
  }
}

async function settleAfterChromeChange(): Promise<void> {
  if (device.getPlatform() !== 'android') return;
  const dashboard = element(by.id('tab-dashboard'));
  // Night mode and font scale restart the activity. Wait it out, and relaunch
  // with the e2e token if the process does not come back on its own.
  try {
    await waitFor(dashboard).not.toExist().withTimeout(15000);
  } catch {
    // The restart can finish before this wait observes the gap.
  }
  try {
    await waitFor(dashboard).toExist().withTimeout(90000);
  } catch {
    await device.launchApp({
      newInstance: true,
      delete: false,
      launchArgs: { e2eAuth: E2E_AUTH_TOKEN },
    });
    await device.disableSynchronization();
    await waitFor(dashboard).toExist().withTimeout(90000);
  }
  await dismissUpdatePrompt();
}

function adb(args: string[]): string {
  const adbBin = process.env.ANDROID_HOME
    ? `${process.env.ANDROID_HOME}/platform-tools/adb`
    : 'adb';
  return execFileSync(adbBin, ['-s', device.id, ...args], { encoding: 'utf8' });
}

export async function setAppearance(appearance: 'light' | 'dark'): Promise<void> {
  if (device.getPlatform() === 'ios') {
    execFileSync('xcrun', ['simctl', 'ui', device.id, 'appearance', appearance]);
    return;
  }
  adb(['shell', 'cmd', 'uimode', 'night', appearance === 'dark' ? 'yes' : 'no']);
  await settleAfterChromeChange();
}

export async function setContentSize(size: 'large' | 'accessibility-large'): Promise<void> {
  if (device.getPlatform() === 'ios') {
    execFileSync('xcrun', ['simctl', 'ui', device.id, 'content_size', size]);
    return;
  }
  // accessibility-large is the iOS content-size category this spec uses.
  // Android's equivalent user setting is font scale. Applying it restarts the activity.
  adb([
    'shell',
    'settings',
    'put',
    'system',
    'font_scale',
    size === 'accessibility-large' ? '1.3' : '1',
  ]);
  await settleAfterChromeChange();
}

function parseAndroidClipboard(raw: string): string {
  const trimmed = raw.replace(/\r/g, '').trim();
  if (!trimmed || trimmed === 'null') return '';
  const clipData = trimmed.match(/ClipData\s*\{[\s\S]*?"([^"]*)"/);
  if (clipData?.[1] != null) return clipData[1];
  return trimmed;
}

export function readClipboard(): string {
  if (device.getPlatform() === 'ios') {
    return execFileSync('xcrun', ['simctl', 'pbpaste', device.id], { encoding: 'utf8' });
  }
  return parseAndroidClipboard(adb(['shell', 'cmd', 'clipboard', 'get']));
}
