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
    await waitFor(element(by.id(onboarding.workplaceIdentityContinue)))
      .toBeVisible()
      .withTimeout(120000);

    await relaunchPreservingData();
    await waitFor(element(by.id(onboarding.workplaceNameInput)))
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
});
