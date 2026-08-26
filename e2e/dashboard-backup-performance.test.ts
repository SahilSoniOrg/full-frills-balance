import { expect, test } from './fixtures';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const prepareBackupForWeb = (backupPath: string) => {
  if (!backupPath.toLowerCase().endsWith('.zip')) return backupPath;

  // The web compression adapter is intentionally a no-op. Extract to an OS
  // temp file so the browser receives JSON, while the personal archive stays
  // outside the repository and is never copied into the project.
  const entries = execFileSync('unzip', ['-Z1', backupPath], { encoding: 'utf8' })
    .split('\n')
    .map(entry => entry.trim())
    .filter(entry => entry && !entry.endsWith('/'));
  const entry = entries.find(candidate => candidate.toLowerCase().endsWith('.json'));
  if (!entry) throw new Error('Backup ZIP does not contain a JSON payload');

  const json = execFileSync('unzip', ['-p', backupPath, entry], { maxBuffer: 64 * 1024 * 1024 });
  const directory = mkdtempSync(join(tmpdir(), 'ffb-dashboard-backup-'));
  const extractedPath = join(directory, 'backup.json');
  writeFileSync(extractedPath, json);
  return extractedPath;
};

/**
 * Heavy-data dashboard benchmark.
 *
 * The backup is deliberately supplied at runtime. Never check a personal
 * export into the repository or encode its path in source control.
 *
 * Run with:
 *   FFB_BACKUP_PATH=/absolute/path/to/backup.zip \
 *     bunx playwright test e2e/dashboard-backup-performance.test.ts
 */
test.describe('Dashboard performance with a local backup', () => {
  test.setTimeout(10 * 60 * 1000);

  test('imports the supplied backup and records dashboard timings', async ({
    onboardingPage,
    dashboardPage,
    page,
  }) => {
    const backupPath = process.env.FFB_BACKUP_PATH;
    test.skip(!backupPath, 'Set FFB_BACKUP_PATH to a local JSON or ZIP backup');
    const browserBackupPath = prepareBackupForWeb(backupPath!);

    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Dashboard Backup Benchmark');

    await page.goto('/import-selection');
    const nativeImportButton = page.getByRole('button', { name: /Select Full/i });
    await expect(nativeImportButton).toBeVisible({ timeout: 30000 });

    const chooserPromise = page.waitForEvent('filechooser');
    await nativeImportButton.click();
    const chooser = await chooserPromise;
    await chooser.setFiles(browserBackupPath);

    await expect(page.getByRole('button', { name: /Overwrite Everything/i })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: /Overwrite Everything/i }).click();

    const restartButton = page.getByRole('button', { name: /Restart/i });
    await expect(restartButton).toBeVisible({ timeout: 9 * 60 * 1000 });
    const appLoadStart = Date.now();
    await restartButton.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('dashboard-screen')).toBeVisible({ timeout: 120000 });
    await expect(page.getByLabel('Open safe-to-spend calculation info')).toBeVisible({
      timeout: 120000,
    });
    const appLoadMs = Date.now() - appLoadStart;

    const coldStart = Date.now();
    await dashboardPage.switchToDashboard();
    await expect(page.getByTestId('dashboard-screen')).toBeVisible({ timeout: 120000 });
    await expect(page.getByLabel('Open safe-to-spend calculation info')).toBeVisible({
      timeout: 120000,
    });
    const coldMs = Date.now() - coldStart;

    const warmSamples: number[] = [];
    for (let sample = 0; sample < 5; sample += 1) {
      await dashboardPage.switchToActivity();
      const warmStart = Date.now();
      await dashboardPage.switchToDashboard();
      await expect(page.getByTestId('dashboard-screen')).toBeVisible({ timeout: 120000 });
      await expect(page.getByLabel('Open safe-to-spend calculation info')).toBeVisible({
        timeout: 120000,
      });
      warmSamples.push(Date.now() - warmStart);
    }

    console.info(
      `[PERF] dashboard backup=${backupPath!.split('/').pop()} app_reload_ms=${appLoadMs} first_open_ms=${coldMs} warm_samples_ms=${warmSamples.join(',')} warm_median_ms=${median(warmSamples)}`,
    );
  });
});
