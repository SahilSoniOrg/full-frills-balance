import { by, element, expect, waitFor } from 'detox';
import { onboarding as setupIds } from '../screens';
import { ONBOARDING_TIMEOUT_MS } from '../constants/timeouts';
import { scrollToId, tapById } from '../actions/mobile/elementActions';

export class SetupPage {
  async openRestoreFromDevice(): Promise<void> {
    // The first-run name input auto-focuses. Tap a non-action heading to dismiss
    // the keyboard before scrolling to the restore option near the footer.
    await element(by.id('onboarding-welcome-hero')).tap();
    await scrollToId(setupIds.restoreButton, ONBOARDING_TIMEOUT_MS);
    await tapById(setupIds.restoreButton, ONBOARDING_TIMEOUT_MS);
    await this.acknowledgePrivacy();
    await waitFor(element(by.id(setupIds.restoreSource)))
      .toExist()
      .withTimeout(ONBOARDING_TIMEOUT_MS);
  }

  async waitForRestoreSummary(): Promise<void> {
    await waitFor(element(by.id(setupIds.restoreSummary)))
      .toExist()
      .withTimeout(ONBOARDING_TIMEOUT_MS);
    await waitFor(element(by.text('Imported Books is validated and ready to restore.')))
      .toExist()
      .withTimeout(ONBOARDING_TIMEOUT_MS);
  }

  async continueRestoreSummary(): Promise<void> {
    await tapById(setupIds.restoreSummaryContinue, ONBOARDING_TIMEOUT_MS);
  }

  async finishSummary(profileName?: string): Promise<void> {
    await this.expectSummary();
    if (profileName) await this.expectProfileName(profileName);
    await tapById(setupIds.finishButton, ONBOARDING_TIMEOUT_MS);
  }

  async expectSummary(): Promise<void> {
    await waitFor(element(by.id(setupIds.summary)))
      .toExist()
      .withTimeout(ONBOARDING_TIMEOUT_MS);
    await waitFor(element(by.id(setupIds.finishButton)))
      .toExist()
      .withTimeout(ONBOARDING_TIMEOUT_MS);
  }

  async expectProfileName(name: string): Promise<void> {
    await expect(element(by.text(name))).toExist();
  }

  async waitForCashClarityWelcome(): Promise<void> {
    await waitFor(element(by.id(setupIds.screen)))
      .toExist()
      .withTimeout(ONBOARDING_TIMEOUT_MS);
    await waitFor(element(by.id(setupIds.nameInput)))
      .toExist()
      .withTimeout(ONBOARDING_TIMEOUT_MS);
  }

  async enterCashClarityName(name: string): Promise<void> {
    const input = element(by.id(setupIds.nameInput));
    await input.tap();
    await input.replaceText(name);
  }

  async acknowledgePrivacy(): Promise<void> {
    const privacySheetLink = element(by.id('privacy-acknowledgement-full-policy-button'));
    await waitFor(privacySheetLink).toBeVisible().withTimeout(ONBOARDING_TIMEOUT_MS);
    await tapById('privacy-acknowledgement-continue-button', ONBOARDING_TIMEOUT_MS);
    await waitFor(privacySheetLink).not.toExist().withTimeout(10000);
  }

  async completeFirstRun(name: string): Promise<void> {
    await this.waitForCashClarityWelcome();
    await this.enterCashClarityName(name);
    await tapById(setupIds.start, ONBOARDING_TIMEOUT_MS);
    await this.acknowledgePrivacy();
    await tapById(setupIds.gridContinue, ONBOARDING_TIMEOUT_MS);
    await tapById(setupIds.skip, ONBOARDING_TIMEOUT_MS);
    await tapById(setupIds.skip, ONBOARDING_TIMEOUT_MS);
    await tapById(setupIds.skip, ONBOARDING_TIMEOUT_MS);
    await tapById(setupIds.skip, ONBOARDING_TIMEOUT_MS);
    await tapById(setupIds.finishButton, ONBOARDING_TIMEOUT_MS);
  }

  async completeFromWorkplace(): Promise<void> {
    // The name field auto-focuses on iOS; its Return action is wired to the same
    // continue callback and remains reachable when the keyboard covers the footer.
    await element(by.id(setupIds.workplaceNameInput)).tapReturnKey();
    for (let i = 0; i < 3; i += 1) {
      await tapById(setupIds.gridContinue, ONBOARDING_TIMEOUT_MS);
    }
    await this.finishSummary();
  }
}

export const setupPage = new SetupPage();
