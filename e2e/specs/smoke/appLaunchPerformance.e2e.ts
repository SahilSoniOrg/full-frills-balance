/**
 * @owner mobile
 * @dataSource e2e
 * @platform ios
 */
import { by, device, element, waitFor } from 'detox';
import { launchOnboardedApp, waitForDashboard } from '../../actions/launch';
import { E2E_AUTH_TOKEN } from '../../utils/launchArgs';

jest.setTimeout(180000);

describe('iOS cold start performance', () => {
  it('records cold, resume, and tab-navigation timings in one run', async () => {
    const backupPath = process.env.FFB_IOS_BACKUP_PATH;
    if (!backupPath) {
      throw new Error('Set FFB_IOS_BACKUP_PATH to a simulator-local backup file');
    }
    // Seed once. Do not include database reset or fixture creation in the
    // startup measurement.
    await launchOnboardedApp({
      seedProfile: 'journal-ready',
      newInstance: true,
      backupPath,
      preserveData: true,
    });

    const coldStarts: number[] = [];
    await device.terminateApp();
    const coldStart = Date.now();
    await device.launchApp({
      newInstance: false,
      delete: false,
      launchArgs: { e2eAuth: E2E_AUTH_TOKEN },
    });
    await waitForDashboard();
    coldStarts.push(Date.now() - coldStart);

    const resumes: number[] = [];
    for (let sample = 0; sample < 3; sample += 1) {
      const start = Date.now();
      await device.reloadReactNative();
      await waitForDashboard();
      resumes.push(Date.now() - start);
    }

    const tabSwitches: number[] = [];
    for (let sample = 0; sample < 5; sample += 1) {
      await element(by.id('tab-activity')).tap();
      await waitFor(element(by.id('tab-activity')))
        .toBeVisible()
        .withTimeout(30000);
      const start = Date.now();
      await element(by.id('tab-dashboard')).tap();
      await waitForDashboard();
      tabSwitches.push(Date.now() - start);
    }

    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };

    // Keep this observational until we have a few stable simulator baselines.
    console.log(
      `[PERF] ios cold_samples_ms=${coldStarts.join(',')} cold_median_ms=${median(coldStarts)} resume_samples_ms=${resumes.join(',')} resume_median_ms=${median(resumes)} tab_samples_ms=${tabSwitches.join(',')} tab_median_ms=${median(tabSwitches)}`,
    );
  });
});
