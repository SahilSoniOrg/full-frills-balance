import { element, by, waitFor } from 'detox';
import { onboarding as onboardingIds } from '../screens';
import { ONBOARDING_TIMEOUT_MS } from '../constants/timeouts';
import { waitForDashboard } from './launch';
import { tapById, typeById } from './mobile/elementActions';

export async function completeOnboardingUi(userName: string): Promise<void> {
  await waitFor(element(by.id(onboardingIds.nameInput)))
    .toBeVisible()
    .withTimeout(ONBOARDING_TIMEOUT_MS);

  const nameInput = element(by.id(onboardingIds.nameInput));
  await nameInput.tap();
  await nameInput.replaceText(userName);
  await nameInput.tapReturnKey();

  await tapById(onboardingIds.continueButton, ONBOARDING_TIMEOUT_MS);

  for (let i = 0; i < 3; i += 1) {
    await tapById(onboardingIds.gridContinue, ONBOARDING_TIMEOUT_MS);
  }

  await tapById(onboardingIds.themeContinue, ONBOARDING_TIMEOUT_MS);
  await tapById(onboardingIds.finishButton, ONBOARDING_TIMEOUT_MS);

  await waitForDashboard(ONBOARDING_TIMEOUT_MS);
}
