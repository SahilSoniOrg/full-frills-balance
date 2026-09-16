/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 *
 * Phase 1 animation feel demo: Dashboard → FAB press → journal composer.
 * Pair with CI `--record-videos all` to produce the MR walkthrough clip.
 */
import { by, device, element, waitFor } from 'detox';
import { launchOnboardedApp, waitForDashboard } from '../../actions/launch';
import { assertVisibleById } from '../../actions/assertions';
import { LONG_TIMEOUT_MS } from '../../constants/timeouts';
import { dashboard, journal } from '../../screens';

jest.setTimeout(600000);

const runDemo = process.env.DETOX_PRESS_HAPTICS_DEMO === '1';

(runDemo ? describe : describe.skip)('Press + haptics demo', () => {
  it('opens journal composer from Dashboard FAB', async () => {
    // Startup / Moti animations keep the run loop busy; drive the clip without sync.
    await launchOnboardedApp({
      seedProfile: 'journal-ready',
      disableSynchronization: true,
    });
    await waitForDashboard(LONG_TIMEOUT_MS);
    await assertVisibleById(dashboard.screen, LONG_TIMEOUT_MS);
    await device.takeScreenshot('press-haptics-01-dashboard');

    await waitFor(element(by.id('fab-button')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await element(by.id('fab-button')).tap();

    await assertVisibleById(journal.screen, LONG_TIMEOUT_MS);
    await device.takeScreenshot('press-haptics-02-journal-composer');
  }, 600000);
});
