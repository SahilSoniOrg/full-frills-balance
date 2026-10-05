import { device } from 'detox';
import { setupOnboardingActions } from '../../actions/onboarding';
import {
  launchFreshApp,
  launchOnboardedApp,
  launchRestoreResumeApp,
  relaunchPreservingData,
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
    await setupOnboardingActions.completeFirstRun('E2E Setup User');
    await waitForDashboard();
  });

  it('opens optional Workplace creation without blocking the current Workplace', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded', disableSynchronization: true });
    await openWorkplaceCreation();
    await setupOnboardingActions.completeFromWorkplace();
    await waitForDashboard();
  });

  it('enters first-run Restore from Cash Clarity', async () => {
    await launchFreshApp({ disableSynchronization: true });
    await setupOnboardingActions.waitForCashClarityWelcome();
    await setupOnboardingActions.enterCashClarityName('E2E Restore User');
    await setupOnboardingActions.openRestoreFromDevice();
  });

  it('publishes first-run Restore through Setup, resumes, and keeps the typed name', async () => {
    await launchRestoreResumeApp({ disableSynchronization: true });
    await setupOnboardingActions.waitForRestoreSummary();

    await relaunchPreservingData();
    await setupOnboardingActions.waitForRestoreSummary();
    await setupOnboardingActions.continueRestoreSummary();
    await setupOnboardingActions.finishSummary('E2E Restore User');
    await waitForDashboard();
  });
});
