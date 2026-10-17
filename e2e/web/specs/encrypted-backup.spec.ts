import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { randomUUID, createHash } from 'node:crypto';
import type {
  NativeKeyReference,
  DeviceUserEnvelope,
} from '../../../src/services/backup/nativeKeyApi';
import type { LocalUserKeys } from '../../../src/services/backup/keyHierarchyRecords';
import {
  installDeviceApprovalTransport,
  deviceExecute,
  readPublicUserRecord,
  installApprovedPublicRecord,
  showApprovalTestStep,
} from '../support/deviceApproval';
import {
  pickFile,
  saveFile,
  openBackupSettings,
  assertJournals,
  freshRestore,
  createBackup,
} from '../support/encryptedBackup';
import { E2E_AUTH_TOKEN } from '../../../src/testing/e2eConstants';

test('encrypted backup recovers financial records in a fresh browser', async ({
  page,
  browser,
}, testInfo) => {
  const errors: string[] = [];
  const monitor = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  monitor(page);
  const { backup, userRecovery, workplaceRecovery } = await createBackup(page, testInfo);
  await page.close();

  // A separate browser context has no financial database, Device vault, or saved preferences.
  const fresh = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: {
      dir: testInfo.outputPath('fresh-browser-video'),
      size: { width: 1280, height: 900 },
    },
  });
  try {
    const restored = await fresh.newPage();
    monitor(restored);
    await restored.goto('http://127.0.0.1:4173/');
    await restored.getByTestId('onboarding-encrypted-restore-button').click();
    await restored.getByTestId('privacy-acknowledgement-continue-button').click();
    await expect(restored.getByTestId('encrypted-backup-restore')).toBeDisabled();
    await pickFile(restored, 'encrypted-backup-pick-zip', backup);
    await expect(restored.getByTestId('encrypted-backup-restore')).toBeDisabled();
    // A Workplace credential cannot substitute for the separate User recovery credential.
    await pickFile(restored, 'encrypted-backup-pick-recovery', workplaceRecovery);
    await restored.getByTestId('encrypted-backup-restore').click();
    await expect(restored.getByTestId('encrypted-backup-message')).toBeVisible();
    await expect(restored.getByTestId('dashboard-screen')).toHaveCount(0);
    await pickFile(restored, 'encrypted-backup-pick-recovery', userRecovery);
    await restored.getByTestId('encrypted-backup-restore').click();
    await expect(restored.getByTestId('dashboard-screen')).toBeVisible({ timeout: 120000 });
    await assertJournals(restored);
    await restored.screenshot({ path: testInfo.outputPath('restored-records.png') });
    await restored.reload();
    await expect(restored.getByTestId('onboarding-encrypted-restore-button')).toHaveCount(0);
    await expect(restored.getByTestId('tab-settings')).toBeVisible();
    // Retrying the same published manifest must not duplicate journal rows.
    await openBackupSettings(restored);
    await restored.getByTestId('encrypted-backup-restore-entry').click();
    await pickFile(restored, 'encrypted-backup-pick-zip', backup);
    await pickFile(restored, 'encrypted-backup-pick-recovery', userRecovery);
    await restored.getByTestId('encrypted-backup-restore').click();
    await expect(restored.getByTestId('dashboard-screen')).toBeVisible();
    await assertJournals(restored);
    await restored.screenshot({ path: testInfo.outputPath('repeat-restore-no-duplicates.png') });
    expect(errors, 'Uncaught browser/worker errors').toEqual([]);
  } finally {
    await fresh.close();
    await testInfo.attach('browser-errors', {
      body: JSON.stringify(errors),
      contentType: 'application/json',
    });
  }
});

for (const failure of ['truncated ZIP', 'tampered signature', 'wrong User recovery'] as const) {
  test(`rejects ${failure} and allows a clean retry`, async ({ page, browser }, testInfo) => {
    const { backup, userRecovery } = await createBackup(page, testInfo);
    let selectedBackup = backup;
    let selectedRecovery = userRecovery;
    if (failure === 'truncated ZIP') {
      selectedBackup = testInfo.outputPath('truncated.zip');
      const bytes = await readFile(backup);
      await writeFile(selectedBackup, bytes.subarray(0, Math.floor(bytes.length / 2)));
    } else if (failure === 'tampered signature') {
      selectedBackup = testInfo.outputPath('tampered.zip');
      const entries = unzipSync(await readFile(backup));
      const manifest = JSON.parse(strFromU8(entries['manifest.json']));
      manifest.createdAt += 1;
      entries['manifest.json'] = strToU8(JSON.stringify(manifest));
      await writeFile(selectedBackup, zipSync(entries, { level: 0 }));
    } else {
      // Generate a genuine credential for an independent User in another isolated browser.
      const other = await browser.newContext();
      try {
        const otherPage = await other.newPage();
        await otherPage.goto(`/?e2eAuth=${E2E_AUTH_TOKEN}&e2eReset=1&e2eSeedProfile=onboarded`);
        await expect(otherPage.getByTestId('dashboard-screen')).toBeVisible();
        await openBackupSettings(otherPage);
        await otherPage.getByTestId('encrypted-backup-begin-user').click();
        selectedRecovery = testInfo.outputPath('other-user-recovery.json');
        await saveFile(otherPage, 'encrypted-backup-export-secret', selectedRecovery);
      } finally {
        await other.close();
      }
    }
    await page.close();
    const fresh = await freshRestore(browser, testInfo);
    try {
      const errors: string[] = [];
      fresh.page.on('pageerror', error => errors.push(error.message));
      await pickFile(fresh.page, 'encrypted-backup-pick-zip', selectedBackup);
      await pickFile(fresh.page, 'encrypted-backup-pick-recovery', selectedRecovery);
      await fresh.page.getByTestId('encrypted-backup-restore').click();
      await expect(fresh.page.getByTestId('encrypted-backup-message')).toContainText(
        failure === 'truncated ZIP'
          ? 'Invalid encrypted backup'
          : failure === 'tampered signature'
            ? 'integrity'
            : 'does not match',
      );
      await expect(fresh.page.getByTestId('dashboard-screen')).toHaveCount(0);
      await fresh.page.screenshot({ path: testInfo.outputPath('rejected-input.png') });
      await fresh.page.getByTestId('encrypted-backup-clear-restore').click();
      await expect(fresh.page.getByTestId('encrypted-backup-restore')).toBeDisabled();
      await expect(fresh.page.getByTestId('encrypted-backup-pick-recovery')).toBeDisabled();
      await pickFile(fresh.page, 'encrypted-backup-pick-zip', backup);
      await pickFile(fresh.page, 'encrypted-backup-pick-recovery', userRecovery);
      await fresh.page.getByTestId('encrypted-backup-restore').click();
      await expect(fresh.page.getByTestId('dashboard-screen')).toBeVisible();
      await assertJournals(fresh.page);
      await fresh.page.screenshot({ path: testInfo.outputPath('retry-restored.png') });
      expect(errors).toEqual([]);
    } finally {
      await fresh.context.close();
    }
  });
}

test('resumes User and Workplace setup after reload without regenerating secrets', async ({
  page,
}, testInfo) => {
  await page.goto(`/?e2eAuth=${E2E_AUTH_TOKEN}&e2eReset=1&e2eSeedProfile=journal-suggestions`);
  await expect(page.getByTestId('dashboard-screen')).toBeVisible();
  await openBackupSettings(page);
  await page.getByTestId('encrypted-backup-begin-user').click();
  const userRecovery = testInfo.outputPath('user-before-reload.json');
  await saveFile(page, 'encrypted-backup-export-secret', userRecovery);
  await page.reload();
  await expect(page.getByTestId('encrypted-backup-verify-secret')).toBeVisible();
  await expect(page.getByTestId('encrypted-backup-export-secret')).toHaveCount(0);
  await expect(page.getByTestId('encrypted-backup-begin-user')).toHaveCount(0);
  await pickFile(page, 'encrypted-backup-verify-secret', userRecovery);
  await page.getByTestId('encrypted-backup-begin-workplace').click();
  const workplaceRecovery = testInfo.outputPath('workplace-before-reload.json');
  await saveFile(page, 'encrypted-backup-export-secret', workplaceRecovery);
  await page.reload();
  await expect(page.getByTestId('encrypted-backup-export-secret')).toHaveCount(0);
  await expect(page.getByTestId('encrypted-backup-verify-secret')).toBeVisible();
  await pickFile(page, 'encrypted-backup-verify-secret', workplaceRecovery);
  await expect(page.getByText('Encryption ready', { exact: true })).toBeVisible();
  await saveFile(page, 'encrypted-backup-create', testInfo.outputPath('after-interruption.zip'));
  await page.screenshot({ path: testInfo.outputPath('resumed-setup.png') });
});

test('refuses to overwrite an existing local Workplace', async ({ page }, testInfo) => {
  const { backup, userRecovery } = await createBackup(page, testInfo);
  await page.getByTestId('encrypted-backup-restore-entry').click();
  await pickFile(page, 'encrypted-backup-pick-zip', backup);
  await pickFile(page, 'encrypted-backup-pick-recovery', userRecovery);
  await page.getByTestId('encrypted-backup-restore').click();
  await expect(page.getByTestId('encrypted-backup-message')).toContainText('will not overwrite');
  await page.screenshot({ path: testInfo.outputPath('existing-workplace-protected.png') });
  await page.goto('/');
  await expect(page.getByTestId('dashboard-screen')).toBeVisible();
  await assertJournals(page);
});

test('Device A approves an independent Device B which restores without a recovery file', async ({
  page,
  browser,
}, testInfo) => {
  await installDeviceApprovalTransport(page);
  const { backup } = await createBackup(page, testInfo);
  const userA = await readPublicUserRecord(page);
  const contextB = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: testInfo.outputPath('device-b-video'), size: { width: 1280, height: 900 } },
  });
  try {
    const deviceB = await contextB.newPage();
    await installDeviceApprovalTransport(deviceB);
    await deviceB.goto('http://127.0.0.1:4173/');
    await deviceB.getByTestId('onboarding-encrypted-restore-button').click();
    await deviceB.getByTestId('privacy-acknowledgement-continue-button').click();
    await expect(deviceB.getByTestId('encrypted-backup-screen')).toBeVisible();
    // Wait for the app's initial lock policy and capability probe to finish.
    await expect(deviceB.getByTestId('encrypted-backup-pick-zip')).toBeEnabled();
    const deviceIdB = randomUUID();
    const keyB = await deviceExecute<NativeKeyReference>(deviceB, 'generateKeys', {
      kind: 'device',
      userId: userA.userId,
      deviceId: deviceIdB,
    });
    expect(keyB.publicKey).not.toEqual(userA.devicePublicKey);
    expect(keyB.keyId).not.toEqual(userA.deviceKeyId);
    const recipient = {
      userId: userA.userId,
      deviceId: deviceIdB,
      publicKey: keyB.publicKey,
      keyId: keyB.keyId,
    };
    const transcript = JSON.stringify([
      'FFB-DEVICE-APPROVAL-TEST/1',
      userA.userId,
      userA.userKeyFingerprint,
      recipient,
    ]);
    const codeA = createHash('sha256').update(transcript).digest('hex').slice(0, 16);
    const codeB = await deviceB.evaluate(async transcript => {
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(transcript));
      return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
    }, transcript);
    expect(codeB).toBe(codeA);
    await showApprovalTestStep(page, `Device A: verified B's request · ${codeA}`);
    await showApprovalTestStep(deviceB, `Device B: independent key generated · ${codeB}`);
    const referenceA = await deviceExecute<NativeKeyReference>(page, 'openKey', {
      kind: 'user',
      user: userA,
    });
    let envelope: DeviceUserEnvelope;
    try {
      await expect(
        deviceExecute(page, 'wrapUserForDevice', {
          key: referenceA,
          recipient: { ...recipient, keyId: userA.deviceKeyId },
        }),
      ).rejects.toThrow('FFB_KEY_INVALID_FILE');
      // Test driver simulates the owner's explicit approval after verifying the request code.
      envelope = await deviceExecute<DeviceUserEnvelope>(page, 'wrapUserForDevice', {
        key: referenceA,
        recipient,
      });
    } finally {
      await deviceExecute(page, 'releaseKey', { key: referenceA });
    }
    const userB: LocalUserKeys = {
      ...userA,
      deviceId: deviceIdB,
      devicePublicKey: envelope.devicePublicKey,
      deviceKeyId: envelope.deviceKeyId,
      deviceEnvelope: envelope.deviceEnvelope,
    };
    expect(userB.userKeyFingerprint).toBe(userA.userKeyFingerprint);
    expect(userB.publicIdentity).toEqual(userA.publicIdentity);
    expect(userB.deviceEnvelope).not.toEqual(userA.deviceEnvelope);
    expect(userB.deviceEnvelope.context.deviceId).toBe(deviceIdB);
    expect(userB.deviceEnvelope.context.recipientKeyId).toBe(keyB.keyId);
    // B has no A private key: simply copying A's original encrypted User record must fail.
    await expect(deviceExecute(deviceB, 'openKey', { kind: 'user', user: userA })).rejects.toThrow(
      'FFB_KEY_RECOVERY_REQUIRED',
    );
    // A likewise cannot open the envelope addressed to B: no B private key exists in A's vault.
    await expect(deviceExecute(page, 'openKey', { kind: 'user', user: userB })).rejects.toThrow(
      'FFB_KEY_RECOVERY_REQUIRED',
    );
    const referenceB = await deviceExecute<NativeKeyReference>(deviceB, 'openKey', {
      kind: 'user',
      user: userB,
    });
    expect(referenceB.keyId).toBe(userA.userKeyFingerprint);
    await deviceExecute(deviceB, 'releaseKey', { key: referenceB });
    await deviceExecute(deviceB, 'releaseKey', { key: keyB });
    await installApprovedPublicRecord(deviceB, userB);
    // Reload discards all transient references: access now depends on B's persistent private key.
    await deviceB.reload();
    await expect(
      deviceB.getByText('This Device already has verified User keys', { exact: false }),
    ).toBeVisible();
    await showApprovalTestStep(
      deviceB,
      'Device B: approved bundle reopened after reload · no recovery file',
    );
    await pickFile(deviceB, 'encrypted-backup-pick-zip', backup);
    await expect(deviceB.getByTestId('encrypted-backup-restore')).toBeEnabled();
    await deviceB.getByTestId('encrypted-backup-restore').click();
    await expect(deviceB.getByTestId('dashboard-screen')).toBeVisible();
    await assertJournals(deviceB);
    await deviceB.screenshot({ path: testInfo.outputPath('device-b-restored.png') });
    // B can sign a new backup using the same User identity through its own Device unlock chain.
    await openBackupSettings(deviceB);
    const backupB = testInfo.outputPath('device-b-backup.zip');
    await saveFile(deviceB, 'encrypted-backup-create', backupB);
    const manifestA = JSON.parse(strFromU8(unzipSync(await readFile(backup))['manifest.json']));
    const manifestB = JSON.parse(strFromU8(unzipSync(await readFile(backupB))['manifest.json']));
    expect(manifestB.authorUserId).toBe(manifestA.authorUserId);
    expect(manifestB.authorDeviceId).toBe(deviceIdB);
    expect(manifestB.authorDeviceId).not.toBe(manifestA.authorDeviceId);
    const publicProof = {
      mode: 'test-harness approval; production pairing UI not implemented',
      userId: userA.userId,
      userKeyFingerprint: userA.userKeyFingerprint,
      deviceA: { id: userA.deviceId, publicKey: userA.devicePublicKey, keyId: userA.deviceKeyId },
      deviceB: { id: deviceIdB, publicKey: userB.devicePublicKey, keyId: userB.deviceKeyId },
      verificationCode: codeA,
      recoveryFileUsedOnB: false,
      wrongVaultsRejected: true,
      restoredJournals: 6,
      secondDeviceSignedBackup: true,
    };
    await writeFile(
      testInfo.outputPath('two-device-proof.json'),
      JSON.stringify(publicProof, null, 2),
    );
    await showApprovalTestStep(page, 'Device A: still usable after approving B');
    await page.reload();
    await expect(page.getByText('Encryption ready', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('device-a-still-ready.png') });
  } finally {
    await contextB.close();
  }
});

test('restores the public fixed pre-refactor archive through the app', async ({
  browser,
}, testInfo) => {
  const fresh = await freshRestore(browser, testInfo);
  try {
    const fixtures = path.resolve(__dirname, '../../../modules/expo-key-crypto/tests/fixtures');
    await pickFile(
      fresh.page,
      'encrypted-backup-pick-zip',
      path.join(fixtures, 'public-pre-refactor-backup.zip'),
    );
    await pickFile(
      fresh.page,
      'encrypted-backup-pick-recovery',
      path.join(fixtures, 'public-pre-refactor-recovery.json'),
    );
    await fresh.page.getByTestId('encrypted-backup-restore').click();
    await expect(fresh.page.getByTestId('dashboard-screen')).toBeVisible({ timeout: 120000 });
    await fresh.page.reload();
    await expect(fresh.page.getByTestId('dashboard-screen')).toBeVisible();
    await fresh.page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await expect(fresh.page.getByText('PUBLIC SYNTHETIC TEST ONLY', { exact: true })).toBeVisible();
  } finally {
    await fresh.context.close();
  }
});
