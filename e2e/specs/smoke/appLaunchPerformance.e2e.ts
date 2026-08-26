/**
 * @owner mobile
 * @dataSource e2e
 * @platform ios
 */
import { device } from 'detox';
import { launchOnboardedApp, waitForDashboard } from '../../actions/launch';
import { E2E_AUTH_TOKEN } from '../../utils/launchArgs';

jest.setTimeout(180000);

describe('iOS cold start performance', () => {
  it('records time to a usable dashboard', async () => {
    // Seed once. Do not include database reset or fixture creation in the
    // startup measurement.
    await launchOnboardedApp({ seedProfile: 'journal-ready', newInstance: true });

    await device.terminateApp();
    const start = Date.now();
    await device.launchApp({
      newInstance: true,
      delete: false,
      launchArgs: { e2eAuth: E2E_AUTH_TOKEN },
    });
    await waitForDashboard();
    const elapsedMs = Date.now() - start;

    // Keep this observational until we have a few stable simulator baselines.
    console.log(`[PERF] ios app_cold_start_ms=${elapsedMs}`);
  });
});
