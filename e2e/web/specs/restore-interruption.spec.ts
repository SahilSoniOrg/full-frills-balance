import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { parseRowManifest } from '../../../src/services/crypto/protocol/rowEnvelope';
import type { WorkplaceId } from '../../../src/types/ids';
import type {
  RestoreBoundary,
  RestoreFaultMode,
  RestoreObservationRequest,
  RestoreVerification,
} from '../../../src/testing/restoreVerification';
import { E2E_AUTH_TOKEN } from '../../../src/testing/e2eConstants';
import { createBackup, pickFile, assertJournals } from '../support/encryptedBackup';

type Observation = Awaited<ReturnType<RestoreVerification['observe']>>;
const verificationUrl = `/?e2eAuth=${E2E_AUTH_TOKEN}&e2eRestoreVerification=1`;
const observe = (page: Page, request: RestoreObservationRequest) =>
  page.evaluate(request => {
    if (!window.__restoreVerification) throw new Error('Restore verification was not authorized');
    return window.__restoreVerification.observe(request);
  }, request);
const primary = (state: Observation) => state.rows.filter(row => row.table !== 'workplace');

async function openRestore(page: Page) {
  await expect(page.getByTestId('onboarding-encrypted-restore-button')).toBeVisible();
  await page.getByTestId('onboarding-encrypted-restore-button').click();
  const privacy = page.getByTestId('privacy-acknowledgement-continue-button');
  // Privacy acceptance persists across page discard; it is only required on first entry.
  await expect(page.getByTestId('encrypted-backup-screen').or(privacy)).toBeVisible();
  if (await privacy.isVisible()) await privacy.click();
  await expect(page.getByTestId('encrypted-backup-pick-zip')).toBeEnabled();
}

function assertBooks(state: Observation, expected: Observation) {
  expect(primary(state)).toEqual(primary(expected));
  expect(state.counts).toEqual(expected.counts);
  expect(state.balances).toEqual(expected.balances);
  const journals = state.rows.filter(
    row => row.table === 'journals' && row.content.status === 'POSTED',
  );
  expect(journals).toHaveLength(6);
  for (const journal of journals) {
    const legs = state.rows.filter(
      row => row.table === 'transactions' && row.content.journalId === journal.rowId,
    );
    expect(legs.length).toBeGreaterThanOrEqual(2);
    const net = legs.reduce(
      (sum, row) =>
        sum + Number(row.content.amount) * (row.content.transactionType === 'DEBIT' ? 1 : -1),
      0,
    );
    expect(net).toBeCloseTo(0, 8);
  }
  expect(state.rows.some(row => row.table === 'journal_metadata')).toBe(true);
  expect(state.rows.some(row => row.table === 'audit_logs')).toBe(true);
}

const scenarios: { boundary: RestoreBoundary; mode: RestoreFaultMode }[] = [
  ...(['recovered', 'published', 'session', 'cleanup', 'launch'] as const).map(boundary => ({
    boundary,
    mode: 'pause' as const,
  })),
  { boundary: 'session', mode: 'throw' },
];
for (const { boundary, mode } of scenarios) {
  test(`${boundary}: ${mode} preserves real restore state across page discard and retry`, async ({
    page,
    browser,
  }, testInfo) => {
    const { backup, userRecovery } = await createBackup(page, testInfo, true);
    const entries = unzipSync(await readFile(backup));
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    const workplaceKeys = JSON.parse(strFromU8(entries['workplace-keys.json']));
    const request: RestoreObservationRequest = {
      userId: manifest.authorUserId,
      deviceId: manifest.authorDeviceId,
      workplaceId: manifest.workplaceId as WorkplaceId,
    };
    const parsed = parseRowManifest(manifest, {
      workplaceId: manifest.workplaceId,
      keyId: manifest.keyId,
      authorUserId: manifest.authorUserId,
    });
    const receipt = createHash('sha256').update(parsed.signedBytes).digest('hex');
    const source = await observe(page, request);
    await page.close();
    const context = await browser.newContext();
    const errors: string[] = [];
    try {
      let target = await context.newPage();
      target.on('pageerror', error => errors.push(error.message));
      await target.goto(verificationUrl);
      await openRestore(target);
      await pickFile(target, 'encrypted-backup-pick-zip', backup);
      await pickFile(target, 'encrypted-backup-pick-recovery', userRecovery);
      await target.evaluate(
        ({ boundary, mode }) => window.__restoreVerification!.arm(boundary, mode),
        { boundary, mode },
      );
      await target.getByTestId('encrypted-backup-restore').click();
      if (boundary !== 'recovered')
        await target.getByTestId('encrypted-backup-restore-confirm').click();
      await expect
        .poll(() => target.evaluate(() => window.__restoreVerification!.status()))
        .toEqual({ reached: [boundary], armed: false });
      // Query the pending ID/session through the observation path; no private keys are read.
      const discovery = await observe(target, { ...request, deviceId: '' });
      const deviceId = discovery.pending ?? discovery.session?.deviceId;
      expect(deviceId).toBeTruthy();
      request.deviceId = deviceId!;
      const before = await observe(target, request);
      expect(before.user).toMatchObject({
        userId: request.userId,
        deviceId,
        fingerprint: source.user!.fingerprint,
        publicIdentity: source.user!.publicIdentity,
      });
      expect(before.user!.deviceKeyId).not.toBe(source.user!.deviceKeyId);
      expect(before.pending).toBe(deviceId);
      expect(before.completionPending).toBe(boundary !== 'recovered');
      expect(before.session).toEqual(
        ['cleanup', 'launch'].includes(boundary)
          ? {
              formatVersion: 1,
              intent: 'recover-user',
              userId: request.userId,
              deviceId,
              userKeyFingerprint: source.user!.fingerprint,
              enrolledWorkplaces: [request.workplaceId],
            }
          : null,
      );
      expect(before.workplaceKey).toBe(
        ['recovered', 'published'].includes(boundary) ? null : workplaceKeys.keyId,
      );
      expect(before.receipt).toBe(boundary === 'recovered' ? null : receipt);
      if (boundary === 'recovered') {
        expect(before.rows).toEqual([]);
        expect(Object.values(before.counts).every(count => count === 0)).toBe(true);
        expect(before.balances).toEqual([]);
      } else expect(primary(before)).toEqual(primary(source));
      expect(before.launch.registered).toBe(false);
      await expect(target.getByTestId('dashboard-screen')).toHaveCount(0);
      if (mode === 'throw')
        await expect(target.getByText('Recovery needs attention', { exact: true })).toBeVisible();
      // Close the page and its dedicated WASM worker. No finally/cancellation can finish it.
      await target.close();
      target = await context.newPage();
      target.on('pageerror', error => errors.push(error.message));
      await target.goto(verificationUrl);
      // Before publication the user still supplies the files. After publication startup
      // resumes the saved handoff automatically, with no picker or archive access.
      let reloaded: Observation | null = null;
      if (boundary === 'recovered') {
        await openRestore(target);
        reloaded = await observe(target, request);
        expect(reloaded).toEqual(before);
        await pickFile(target, 'encrypted-backup-pick-zip', backup);
        await pickFile(target, 'encrypted-backup-pick-recovery', userRecovery);
        await target.getByTestId('encrypted-backup-restore').click();
        await target.getByTestId('encrypted-backup-restore-confirm').click();
      }
      await expect(target.getByTestId('dashboard-screen')).toBeVisible({ timeout: 120000 });
      const after = await observe(target, request);
      expect(after.user).toEqual(before.user);
      expect(after.workplaceKey).toBe(workplaceKeys.keyId);
      expect(after.pending).toBeNull();
      expect(after.receipt).toBe(receipt);
      expect(after.completionPending).toBe(false);
      expect(after.session).toMatchObject({ deviceId, userId: request.userId });
      expect(after.launch).toMatchObject({
        registered: true,
        activeWorkplaceId: request.workplaceId,
        draft: undefined,
      });
      assertBooks(after, source);
      await assertJournals(target);
      await target.getByRole('tab', { name: 'Settings', exact: true }).click();
      await expect(target.getByTestId('settings-data-management')).toBeVisible();
      // Navigation drops launch query parameters. Re-authorize this page's test-only
      // observation adapter without resetting any app storage before the reload.
      await target.evaluate(
        ({ token }) => {
          const url = new URL(location.href);
          url.searchParams.set('e2eAuth', token);
          url.searchParams.set('e2eRestoreVerification', '1');
          history.replaceState(null, '', url);
        },
        { token: E2E_AUTH_TOKEN },
      );
      await target.reload();
      await expect(target.getByTestId('tab-settings')).toBeVisible();
      expect(await observe(target, request)).toEqual(after);
      await testInfo.attach('restore-boundary-proof', {
        body: JSON.stringify({ boundary, mode, before, reloaded, after }),
        contentType: 'application/json',
      });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('restore verification requires authenticated E2E bootstrap', async ({ page }) => {
  await page.goto('/?e2eRestoreVerification=1');
  await expect(page.getByTestId('onboarding-encrypted-restore-button')).toBeVisible();
  expect(await page.evaluate(() => window.__restoreVerification)).toBeUndefined();
});
