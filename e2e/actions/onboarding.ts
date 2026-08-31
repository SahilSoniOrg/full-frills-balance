import { waitForDashboard } from './launch';
import { setupPage } from '../pages/setup-page';

export async function completeOnboardingUi(userName: string): Promise<void> {
  await setupPage.completeFirstRun(userName);
  await waitForDashboard();
}
