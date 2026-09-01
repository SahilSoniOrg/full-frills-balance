import { by, element, expect, waitFor } from 'detox';
import { onboarding as setupIds } from '../screens';
import { ONBOARDING_TIMEOUT_MS } from '../constants/timeouts';
import { tapById } from '../actions/mobile/elementActions';

export class SetupPage {
  async waitForDeviceSlice(): Promise<void> {
    await waitFor(element(by.id(setupIds.screen)))
      .toExist()
      .withTimeout(ONBOARDING_TIMEOUT_MS);
    await waitFor(element(by.id(setupIds.nameInput)))
      .toExist()
      .withTimeout(ONBOARDING_TIMEOUT_MS);
  }

  async enterDisplayName(name: string): Promise<void> {
    const input = element(by.id(setupIds.nameInput));
    await input.tap();
    await input.replaceText(name);
    await input.tapReturnKey();
  }

  async typeDisplayName(name: string): Promise<void> {
    const input = element(by.id(setupIds.nameInput));
    await input.tap();
    await input.replaceText(name);
  }

  async openRestoreFromDevice(): Promise<void> {
    await tapById(setupIds.restoreButton, ONBOARDING_TIMEOUT_MS);
    await waitFor(element(by.id(setupIds.restoreSource)))
      .toExist()
      .withTimeout(ONBOARDING_TIMEOUT_MS);
  }

  async waitForRestoreSummary(): Promise<void> {
    await waitFor(element(by.id(setupIds.restoreSummary)))
      .toExist()
      .withTimeout(ONBOARDING_TIMEOUT_MS);
    await waitFor(
      element(by.text('Imported Books was published and is ready for the final setup step.')),
    )
      .toExist()
      .withTimeout(ONBOARDING_TIMEOUT_MS);
  }

  async continueRestoreSummary(): Promise<void> {
    await tapById(setupIds.restoreSummaryContinue, ONBOARDING_TIMEOUT_MS);
  }

  async continueWorkplaceSetup(): Promise<void> {
    // First-run workplace identity is automatic; currency, accounts, and categories remain visible.
    for (let i = 0; i < 3; i += 1) {
      await tapById(setupIds.gridContinue, ONBOARDING_TIMEOUT_MS);
    }
  }

  async finishAppearanceAndSummary(profileName?: string): Promise<void> {
    await tapById(setupIds.themeContinue, ONBOARDING_TIMEOUT_MS);
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

  async completeFirstRun(name: string): Promise<void> {
    await this.waitForDeviceSlice();
    await this.enterDisplayName(name);
    await this.continueWorkplaceSetup();
    await this.finishAppearanceAndSummary();
  }

  async completeFromWorkplace(includeAppearance = true): Promise<void> {
    await tapById(setupIds.workplaceIdentityContinue, ONBOARDING_TIMEOUT_MS);
    for (let i = 0; i < 3; i += 1) {
      await tapById(setupIds.gridContinue, ONBOARDING_TIMEOUT_MS);
    }
    if (includeAppearance) {
      await this.finishAppearanceAndSummary();
      return;
    }

    await this.expectSummary();
    await tapById(setupIds.finishButton, ONBOARDING_TIMEOUT_MS);
  }
}

export const setupPage = new SetupPage();
