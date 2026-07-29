/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { element, by, waitFor } from 'detox';
import { completeOnboardingUi } from '../../actions/onboarding';
import { launchFreshApp, waitForDashboard } from '../../actions/launch';
import { onboarding } from '../../screens';

jest.setTimeout(300000);

describe('Onboarding', () => {
  beforeAll(async () => {
    await launchFreshApp();
  }, 180000);

  it('completes the onboarding UI flow', async () => {
    await waitFor(element(by.id(onboarding.nameInput)))
      .toExist()
      .withTimeout(120000);
    await completeOnboardingUi('Detox Onboarding User');
    await waitForDashboard(120000);
  });
});
