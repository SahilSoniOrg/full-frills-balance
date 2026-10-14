/** @owner mobile @dataSource disposable-demo @platform ios,android */
import { device, element, by, waitFor } from 'detox';
import { expect as jestExpect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { E2E_AUTH_TOKEN } from '@/src/testing/e2eConstants';

jest.setTimeout(300000);
const role = process.env.FFB_RECOVERY_ROLE ?? 'source';
const transfer = process.env.FFB_RECOVERY_TRANSFER_DIR;
const simulator = process.env.DETOX_IOS_SIMULATOR_UDID;
const androidSerial = process.env.DETOX_ANDROID_DEVICE_ID;
const adbPath = process.env.ANDROID_HOME
  ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb')
  : 'adb';
const appId = process.env.FFB_RECOVERY_APP_ID ?? 'in.sahilsoni.fullfrillsbalance';

function transferDirectory(): string {
  if (!transfer || !path.isAbsolute(transfer))
    throw new Error('Set FFB_RECOVERY_TRANSFER_DIR to an absolute local directory');
  fs.mkdirSync(transfer, { recursive: true });
  return transfer;
}

function appContainer(): string {
  if (!simulator) throw new Error('Set DETOX_IOS_SIMULATOR_UDID to the isolated test simulator');
  return execFileSync('xcrun', ['simctl', 'get_app_container', simulator, appId, 'data'], {
    encoding: 'utf8',
  }).trim();
}

function android(command: string[]): string {
  if (
    !androidSerial ||
    !/^emulator-[0-9]+$/.test(androidSerial) ||
    process.env.FFB_RECOVERY_ANDROID_ROOT !== '1'
  )
    throw new Error('Fixture transfer requires an explicitly selected disposable rooted emulator');
  const name = execFileSync(adbPath, ['-s', androidSerial, 'emu', 'avd', 'name'], {
    encoding: 'utf8',
  }).trim();
  if (!name.startsWith('FFB_Keys_'))
    throw new Error('Refusing fixture access outside a disposable key-proof AVD');
  if (!/^[a-zA-Z0-9_.]+$/.test(appId)) throw new Error('Invalid fixture application ID');
  return execFileSync(adbPath, ['-s', androidSerial, ...command], { encoding: 'utf8' });
}
const fixtureFiles = [
  'native-recovery-proof.json',
  'native-recovery-user-secret.json',
  'native-recovery-workplace-secret.json',
];
function exportBundle(): void {
  for (const name of fixtureFiles) {
    const destination = path.join(transferDirectory(), name);
    if (device.getPlatform() === 'android')
      android(['pull', `/data/user/0/${appId}/files/${name}`, destination]);
    else fs.copyFileSync(path.join(appContainer(), 'Documents', name), destination);
  }
}
function inputBundle(): string {
  const directory =
    device.getPlatform() === 'android'
      ? `/data/user/0/${appId}/files`
      : path.join(appContainer(), 'Documents');
  for (const name of fixtureFiles) {
    const source = path.join(transferDirectory(), name);
    const destination = `${directory}/${name}`;
    if (device.getPlatform() === 'android') {
      android(['push', source, destination]);
      const owner = android(['shell', 'stat', '-c', '%u:%g', directory]).trim();
      const context = android(['shell', 'ls', '-Zd', directory]).trim().split(/\s+/)[0];
      if (!/^\d+:\d+$/.test(owner) || !/^u:object_r:app_data_file:s0(:c[\d,c]+)?$/.test(context))
        throw new Error('Unexpected disposable app sandbox permissions');
      android(['shell', 'chown', owner, destination]);
      android(['shell', 'chcon', context, destination]);
      android(['shell', 'chmod', '600', destination]);
    } else fs.copyFileSync(source, destination);
  }
  return `${directory}/native-recovery-proof.json`;
}

async function launch(action: string, clean: boolean, bundlePath?: string): Promise<void> {
  await device.launchApp({
    newInstance: true,
    delete: clean,
    launchArgs: {
      e2eAuth: E2E_AUTH_TOKEN,
      e2eRecoveryAction: action,
      ...(bundlePath ? { e2eRecoveryBundlePath: bundlePath } : {}),
    },
  });
  await device.disableSynchronization();
  await waitFor(element(by.id('recovery-proof-state')))
    .toHaveText('READY')
    .withTimeout(120000);
}

async function runAndRead(stage: string): Promise<Record<string, unknown>> {
  await element(by.id('recovery-proof-run')).tap();
  const deadline = Date.now() + 180000;
  let status: string | undefined;
  do {
    const state = await element(by.id('recovery-proof-state')).getAttributes();
    status = 'text' in state ? state.text : 'label' in state ? state.label : undefined;
    if (status === 'PASS' || status === 'FAIL') break;
    await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  if (status !== 'PASS') {
    const failure = await element(by.id('recovery-proof-message')).getAttributes();
    const detail =
      'text' in failure ? failure.text : 'label' in failure ? failure.label : undefined;
    throw new Error(`Native proof ${stage}: ${String(detail)}`);
  }
  const attributes = await element(by.id('recovery-proof-report')).getAttributes();
  const text =
    'text' in attributes ? attributes.text : 'label' in attributes ? attributes.label : undefined;
  if (typeof text !== 'string') throw new Error('Native proof did not return a readable report');
  const report = JSON.parse(text) as Record<string, unknown>;
  return report;
}

describe('Native private backup recovery', () => {
  if (role === 'source') {
    it('creates/encrypts the development demo and rejects invalid recovery material', async () => {
      await launch('prepare', true);
      const report = await runAndRead('prepare');
      jestExpect(report.deviceVaultVerified).toBe(true);
      jestExpect(report.userSigningPairVerified).toBe(true);
      jestExpect(report.tamperRejected).toBe(true);
      jestExpect(report.wrongCodeRejected).toBe(true);
      jestExpect(Number(report.journals)).toBeGreaterThan(0);
      // Transfers disposable encrypted demo + external recovery material. Never print its contents.
      exportBundle();
    });
    it('retains the real secure key across process termination and restart', async () => {
      await device.terminateApp();
      await launch('restart', false);
      jestExpect((await runAndRead('restart')).savedKeySurvived).toBe(true);
    });
  } else if (role === 'replacement') {
    it('recovers on a fresh installation with no source key, preserving source records and retry safety', async () => {
      await launch('recover', true);
      // Launch created the new app container; file transfer happens before pressing the stage button.
      const destination = inputBundle();
      await device.terminateApp();
      await launch('recover', false, destination);
      const report = await runAndRead('replacement');
      jestExpect(report.sourceKeyWasAbsent).toBe(true);
      jestExpect(report.recoveredUsingCode).toBe(true);
      jestExpect(report.recordIdentityAndContentVerified).toBe(true);
      jestExpect(report.retryDidNotDuplicate).toBe(true);
    });
  } else if (role === 'reinstall') {
    it('recovers after uninstall/reinstall using externally preserved material', async () => {
      await launch('reinstall', true);
      const destination = inputBundle();
      await device.terminateApp();
      await launch('reinstall', false, destination);
      const report = await runAndRead('reinstall');
      jestExpect(report.recoveredUsingCode).toBe(true);
      jestExpect(report.recordIdentityAndContentVerified).toBe(true);
      jestExpect(report.retryDidNotDuplicate).toBe(true);
    });
  } else if (role === 'large') {
    it('measures snapshot capture/encryption/recovery with 5,000 additional journals', async () => {
      await launch('large', true);
      const report = await runAndRead('large');
      jestExpect(Number(report.journals)).toBeGreaterThan(5000);
      jestExpect(report.deviceVaultVerified).toBe(true);
      jestExpect(report.userSigningPairVerified).toBe(true);
      jestExpect(Number(report.plaintextBytes)).toBeGreaterThan(1_000_000);
      exportBundle();
    });
    it('restores the larger book after reinstall and verifies every source record', async () => {
      await launch('reinstall', true);
      const destination = inputBundle();
      await device.terminateApp();
      await launch('reinstall', false, destination);
      const report = await runAndRead('large-recovery');
      jestExpect(Number(report.journals)).toBeGreaterThan(5000);
      jestExpect(report.recordIdentityAndContentVerified).toBe(true);
      jestExpect(report.bookConfigurationVerified).toBe(true);
      jestExpect(report.retryDidNotDuplicate).toBe(true);
    });
  } else if (role === 'missing-device-key' || role === 'orphan-device-key') {
    it(`routes ${role} to same-User recovery without modifying existing books`, async () => {
      await launch('prepare', true);
      await runAndRead(`${role}-prepare`);
      await device.terminateApp();
      await launch(role, false);
      const report = await runAndRead(role);
      jestExpect(report.recoveryRequired).toBe(true);
      jestExpect(report.sameUserIdentityVerified).toBe(true);
      jestExpect(report.sameSigningIdentityVerified).toBe(true);
      jestExpect(report.sameDekVerified).toBe(true);
      jestExpect(report.existingDataUnchanged).toBe(true);
      if (role === 'orphan-device-key') jestExpect(report.orphanPreserved).toBe(true);
    });
  } else throw new Error('Unknown FFB_RECOVERY_ROLE');
});
