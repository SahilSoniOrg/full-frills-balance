/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { element, by, waitFor } from 'detox';
import { completeOnboardingUi } from '../../actions/onboarding';
import { launchFreshApp } from '../../actions/launch';
import { dashboard, onboarding } from '../../screens';

jest.setTimeout(300000);

describe('Onboarding', () => {
  beforeAll(async () => {
    await launchFreshApp();
  });

  it('completes the onboarding UI flow', async () => {
    await waitFor(element(by.id(onboarding.screen)))
      .toBeVisible()
      .withTimeout(120000);
    await completeOnboardingUi('Detox Onboarding User');
    await waitFor(element(by.id(dashboard.screen)))
      .toBeVisible()
      .withTimeout(120000);
  });
});
