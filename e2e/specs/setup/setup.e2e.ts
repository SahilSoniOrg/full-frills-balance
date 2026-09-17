/**
 * @owner mobile
 * @dataSource e2e
 * @platform ios
 */
import { device } from 'detox';
import { setupPage } from '../../pages/setup-page';
import {
  launchFreshApp,
  launchOnboardedApp,
  launchRestoreResumeApp,
  openWorkplaceCreation,
  waitForDashboard,
} from '../../actions/launch';

jest.setTimeout(300000);

describe('Setup journeys', () => {
  afterAll(async () => {
    try {
      await device.enableSynchronization();
    } catch {
      // The app may have exited after the final journey.
    }
  });

  it('completes the Cash Clarity first-run flow', async () => {
    await launchFreshApp({ disableSynchronization: true });
    await setupPage.completeFirstRun('E2E Setup User');
    await waitForDashboard();
  });

  it('opens optional Workplace creation without blocking the current Workplace', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded', disableSynchronization: true });
    await openWorkplaceCreation();
    await setupPage.completeFromWorkplace(false);
    await waitForDashboard();
  });

  it('enters first-run Restore from Cash Clarity', async () => {
    await launchFreshApp({ disableSynchronization: true });
    await setupPage.waitForCashClarityWelcome();
    await setupPage.enterCashClarityName('E2E Restore User');
    await setupPage.openRestoreFromDevice();
  });

  it('publishes first-run Restore through Setup, resumes, and keeps the typed name', async () => {
    await launchRestoreResumeApp({ disableSynchronization: true });
    await setupPage.waitForRestoreSummary();

    await relaunchPreservingData();
    await setupPage.waitForRestoreSummary();
    await setupPage.continueRestoreSummary();
    await setupPage.finishAppearanceAndSummary('E2E Restore User');
    await waitForDashboard();
  });
});
