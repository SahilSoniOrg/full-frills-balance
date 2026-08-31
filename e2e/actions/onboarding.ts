import { element, by, waitFor } from 'detox';
import { onboarding as onboardingIds } from '../screens';
import { ONBOARDING_TIMEOUT_MS } from '../constants/timeouts';
import { waitForDashboard } from './launch';
import { tapById } from './mobile/elementActions';

export async function completeOnboardingUi(userName: string): Promise<void> {
  await waitFor(element(by.id(onboardingIds.nameInput)))
    .toBeVisible()
    .withTimeout(ONBOARDING_TIMEOUT_MS);

  const nameInput = element(by.id(onboardingIds.nameInput));
  await nameInput.tap();
  await nameInput.replaceText(userName);
  await nameInput.tapReturnKey();

  // Return submits Device setup. Personal Workplace setup starts at currency;
  // there is no second Device-step Continue button to tap here.
  for (let i = 0; i < 3; i += 1) {
    await tapById(onboardingIds.gridContinue, ONBOARDING_TIMEOUT_MS);
  }

  await tapById(onboardingIds.finishButton, ONBOARDING_TIMEOUT_MS);

  await waitForDashboard(ONBOARDING_TIMEOUT_MS);
}
