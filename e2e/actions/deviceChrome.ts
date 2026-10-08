import { execFileSync } from 'node:child_process';
import { device } from 'detox';

function adb(args: string[]): string {
  const adbBin = process.env.ANDROID_HOME
    ? `${process.env.ANDROID_HOME}/platform-tools/adb`
    : 'adb';
  return execFileSync(adbBin, ['-s', device.id, ...args], { encoding: 'utf8' });
}

export function setAppearance(appearance: 'light' | 'dark'): void {
  if (device.getPlatform() === 'ios') {
    execFileSync('xcrun', ['simctl', 'ui', device.id, 'appearance', appearance]);
    return;
  }
  adb(['shell', 'cmd', 'uimode', 'night', appearance === 'dark' ? 'yes' : 'no']);
}

export function setContentSize(size: 'large' | 'accessibility-large'): void {
  if (device.getPlatform() === 'ios') {
    execFileSync('xcrun', ['simctl', 'ui', device.id, 'content_size', size]);
    return;
  }
  // accessibility-large is the iOS content-size category this spec uses.
  // Android's equivalent user setting is font scale.
  adb([
    'shell',
    'settings',
    'put',
    'system',
    'font_scale',
    size === 'accessibility-large' ? '1.3' : '1',
  ]);
}

export function readClipboard(): string {
  if (device.getPlatform() === 'ios') {
    return execFileSync('xcrun', ['simctl', 'pbpaste', device.id], { encoding: 'utf8' });
  }
  return adb(['shell', 'cmd', 'clipboard', 'get']).trim();
}
