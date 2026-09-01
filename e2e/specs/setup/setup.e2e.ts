/**
 * @owner mobile
 * @dataSource e2e
 * @platform ios
 */
import { device, element, by, waitFor } from 'detox';
import { setupPage } from '../../pages/setup-page';
import {
  launchFreshApp,
  launchOnboardedApp,
  launchRestoreResumeApp,
  openWorkplaceCreation,
  relaunchPreservingData,
  waitForDashboard,
} from '../../actions/launch';
import { onboarding } from '../../screens';

jest.setTimeout(300000);

describe('Setup journeys', () => {
  afterAll(async () => {
    try {
      await device.enableSynchronization();
    } catch {
      // The app may have exited after the final journey.
    }
  });

  it('completes first-run Device, Workplace, Appearance, and Summary slices', async () => {
    await launchFreshApp({ disableSynchronization: true });
    await setupPage.completeFirstRun('E2E Setup User');
    await waitForDashboard();
  });

  it('resumes from the persisted Workplace slice after termination', async () => {
    await launchFreshApp({ disableSynchronization: true });
    await setupPage.waitForDeviceSlice();
    await setupPage.enterDisplayName('E2E Resume User');
    await waitFor(element(by.id(onboarding.gridContinue)))
      .toBeVisible()
      .withTimeout(120000);

    await relaunchPreservingData();
    await waitFor(element(by.id(onboarding.gridContinue)))
      .toBeVisible()
      .withTimeout(120000);
    await setupPage.completeFromWorkplace();
    await waitForDashboard();
  });

  it('opens optional Workplace creation without blocking the current Workplace', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded', disableSynchronization: true });
    await openWorkplaceCreation();
    await setupPage.completeFromWorkplace(false);
    await waitForDashboard();
  });

  it('enters first-run Restore as a Setup journey from Device setup', async () => {
    await launchFreshApp({ disableSynchronization: true });
    await setupPage.waitForDeviceSlice();
    await setupPage.typeDisplayName('E2E Restore User');
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
