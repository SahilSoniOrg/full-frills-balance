import { element, by, waitFor } from 'detox';
import { onboarding as onboardingIds } from '../screens';
import { ONBOARDING_TIMEOUT_MS } from '../constants/timeouts';
import { tapById, typeById } from './mobile/elementActions';

export async function completeOnboardingUi(userName: string): Promise<void> {
  await waitFor(element(by.id(onboardingIds.nameInput)))
    .toBeVisible()
    .withTimeout(ONBOARDING_TIMEOUT_MS);

  await typeById(onboardingIds.nameInput, userName);
  await tapById(onboardingIds.continueButton);

  for (let i = 0; i < 3; i += 1) {
    await tapById(onboardingIds.gridContinue, ONBOARDING_TIMEOUT_MS);
  }

  await tapById(onboardingIds.themeContinue, ONBOARDING_TIMEOUT_MS);
  await tapById(onboardingIds.finishButton, ONBOARDING_TIMEOUT_MS);

  await waitFor(element(by.id('dashboard-screen')))
    .toBeVisible()
    .withTimeout(ONBOARDING_TIMEOUT_MS);
}
