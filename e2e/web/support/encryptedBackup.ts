import { expect, type Page, type TestInfo, type Browser } from '@playwright/test';
import { stat } from 'node:fs/promises';
import { E2E_AUTH_TOKEN } from '../../../src/testing/e2eConstants';

export async function pickFile(page: Page, button: string, filename: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId(button).click();
  await (await chooser).setFiles(filename);
}

export async function continueEncryptedRestoreFromArchive(page: Page) {
  await page.getByTestId('encrypted-backup-next-recovery').click();
}

/** Pick the backup ZIP on restore step 1 and advance to recovery choices. */
export async function pickRestoreBackupZip(page: Page, filename: string) {
  await pickFile(page, 'encrypted-backup-pick-zip', filename);
  await continueEncryptedRestoreFromArchive(page);
}

export async function saveFile(page: Page, button: string, filename: string) {
  const download = page.waitForEvent('download');
  await page.getByTestId(button).click();
  await (await download).saveAs(filename);
  expect((await stat(filename)).size).toBeGreaterThan(0);
}

export async function openBackupSettings(page: Page) {
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByTestId('settings-data-management').click();
  await page.getByTestId('settings-encrypted-backup').click();
}

export async function assertJournals(page: Page) {
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  for (let index = 1; index <= 6; index++) {
    const journal = page
      .getByText(`Detox grocery history item ${index}`, { exact: true })
      .and(page.locator(':not([aria-hidden="true"] *)'));
    await expect(journal).toHaveCount(1);
    await expect(journal).toBeVisible();
  }
}

export async function freshRestore(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: testInfo.outputPath('recovery-video'), size: { width: 1280, height: 900 } },
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.getByTestId('onboarding-encrypted-restore-button').click();
  await page.getByTestId('privacy-acknowledgement-continue-button').click();
  return { context, page };
}

export async function createBackup(page: Page, testInfo: TestInfo, restoreVerification = false) {
  await page.goto(
    `/?${new URLSearchParams({
      e2eAuth: E2E_AUTH_TOKEN,
      ...(restoreVerification ? { e2eRestoreVerification: '1' } : {}),
      e2eReset: '1',
      e2eSeedProfile: 'journal-suggestions',
    })}`,
  );
  await expect(page.getByTestId('dashboard-screen')).toBeVisible({ timeout: 120000 });
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByTestId('settings-data-management').click();
  await page.getByTestId('settings-encrypted-backup').click();
  await expect(page.getByTestId('encrypted-backup-begin-user')).toBeEnabled();
  await page.getByTestId('encrypted-backup-begin-user').click();

  const userRecovery = testInfo.outputPath('user-recovery.json');
  await saveFile(page, 'encrypted-backup-export-secret', userRecovery);
  await pickFile(page, 'encrypted-backup-verify-secret', userRecovery);
  await page.getByTestId('encrypted-backup-begin-workplace').click();
  const workplaceRecovery = testInfo.outputPath('workplace-recovery.json');
  await saveFile(page, 'encrypted-backup-export-secret', workplaceRecovery);
  await pickFile(page, 'encrypted-backup-verify-secret', workplaceRecovery);
  await expect(page.getByText('Encryption ready', { exact: true })).toBeVisible();
  const backup = testInfo.outputPath('encrypted-backup.zip');
  await saveFile(page, 'encrypted-backup-create', backup);
  await expect(page.getByTestId('encrypted-backup-message')).toContainText(
    'Encrypted backup saved',
  );
  await page.screenshot({ path: testInfo.outputPath('backup-created.png') });
  return { backup, userRecovery, workplaceRecovery };
}
