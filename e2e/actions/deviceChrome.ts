import { execFileSync } from 'node:child_process';
import { by, device, element, waitFor } from 'detox';

async function settleAfterChromeChange(): Promise<void> {
  if (device.getPlatform() !== 'android') return;
  const later = element(by.text('Later'));
  try {
    await waitFor(later).toBeVisible().withTimeout(8000);
    await later.tap();
  } catch {
    // The activity restart does not always surface the update prompt.
  }
  await waitFor(element(by.id('tab-dashboard')))
    .toExist()
    .withTimeout(60000);
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

export function readClipboard(): string {
  if (device.getPlatform() === 'ios') {
    return execFileSync('xcrun', ['simctl', 'pbpaste', device.id], { encoding: 'utf8' });
  }
  return adb(['shell', 'cmd', 'clipboard', 'get']).trim();
}
