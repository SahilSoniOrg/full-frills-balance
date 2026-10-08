import { by, element, expect, waitFor } from 'detox';
import { onboarding as setupIds } from '../screens';
import { ONBOARDING_TIMEOUT_MS } from '../constants/timeouts';
import { scrollToId, tapById } from './mobile/elementActions';
import { waitForDashboard } from './launch';

async function openRestoreFromDevice(): Promise<void> {
  await element(by.id('onboarding-welcome-hero')).tap();
  await scrollToId(setupIds.restoreButton, ONBOARDING_TIMEOUT_MS);
  await tapById(setupIds.restoreButton, ONBOARDING_TIMEOUT_MS);
  await acknowledgePrivacy();
  await waitFor(element(by.id(setupIds.restoreSource)))
    .toExist()
    .withTimeout(ONBOARDING_TIMEOUT_MS);
}

async function waitForRestoreSummary(): Promise<void> {
  await waitFor(element(by.id(setupIds.restoreSummary)))
    .toExist()
    .withTimeout(ONBOARDING_TIMEOUT_MS);
  await waitFor(element(by.text('Imported Books is validated and ready to restore.')))
    .toExist()
    .withTimeout(ONBOARDING_TIMEOUT_MS);
}

async function continueRestoreSummary(): Promise<void> {
  await tapById(setupIds.restoreSummaryContinue, ONBOARDING_TIMEOUT_MS);
}

async function finishSummary(profileName?: string): Promise<void> {
  await expectSummary();
  if (profileName) await expectProfileName(profileName);
  await tapById(setupIds.finishButton, ONBOARDING_TIMEOUT_MS);
}

async function expectSummary(): Promise<void> {
  await waitFor(element(by.id(setupIds.summary)))
    .toExist()
    .withTimeout(ONBOARDING_TIMEOUT_MS);
  await waitFor(element(by.id(setupIds.finishButton)))
    .toExist()
    .withTimeout(ONBOARDING_TIMEOUT_MS);
}

async function expectProfileName(name: string): Promise<void> {
  await expect(element(by.text(name))).toExist();
}

async function waitForCashClarityWelcome(): Promise<void> {
  await waitFor(element(by.id(setupIds.screen)))
    .toExist()
    .withTimeout(ONBOARDING_TIMEOUT_MS);
  await waitFor(element(by.id(setupIds.nameInput)))
    .toExist()
    .withTimeout(ONBOARDING_TIMEOUT_MS);
}

async function enterCashClarityName(name: string): Promise<void> {
  const input = element(by.id(setupIds.nameInput));
  await input.tap();
  await input.replaceText(name);
}

async function acknowledgePrivacy(): Promise<void> {
  const privacySheetLink = element(by.id('privacy-acknowledgement-full-policy-button'));
  try {
    await waitFor(privacySheetLink).toBeVisible().withTimeout(8000);
  } catch {
    await scrollToId('privacy-acknowledgement-full-policy-button', ONBOARDING_TIMEOUT_MS);
  }
  await waitFor(privacySheetLink).toBeVisible().withTimeout(ONBOARDING_TIMEOUT_MS);
  await tapById('privacy-acknowledgement-continue-button', ONBOARDING_TIMEOUT_MS);
  await waitFor(privacySheetLink).not.toExist().withTimeout(10000);
}

async function completeFirstRun(name: string): Promise<void> {
  await waitForCashClarityWelcome();
  await enterCashClarityName(name);
  await tapById(setupIds.start, ONBOARDING_TIMEOUT_MS);
  await acknowledgePrivacy();
  await tapById(setupIds.gridContinue, ONBOARDING_TIMEOUT_MS);
  await tapById(setupIds.skip, ONBOARDING_TIMEOUT_MS);
  await tapById(setupIds.skip, ONBOARDING_TIMEOUT_MS);
  await tapById(setupIds.skip, ONBOARDING_TIMEOUT_MS);
  await tapById(setupIds.skip, ONBOARDING_TIMEOUT_MS);
  await tapById(setupIds.finishButton, ONBOARDING_TIMEOUT_MS);
}

async function completeFromWorkplace(): Promise<void> {
  await element(by.id(setupIds.workplaceNameInput)).tapReturnKey();
  for (let i = 0; i < 3; i += 1) {
    await tapById(setupIds.gridContinue, ONBOARDING_TIMEOUT_MS);
  }
  await finishSummary();
}

export async function completeOnboardingUi(userName: string): Promise<void> {
  await completeFirstRun(userName);
  await waitForDashboard();
}

export const setupOnboardingActions = {
  openRestoreFromDevice,
  waitForRestoreSummary,
  continueRestoreSummary,
  finishSummary,
  waitForCashClarityWelcome,
  enterCashClarityName,
  completeFirstRun,
  completeFromWorkplace,
};
