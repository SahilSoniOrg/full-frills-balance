import { device, element, by, waitFor } from 'detox';

const METRO_URL = process.env.DETOX_METRO_URL ?? 'http://localhost:8081';
const DEV_CLIENT_URL = `exp+full-frills-balance://expo-development-client/?url=${encodeURIComponent(METRO_URL)}`;

async function connectDevClientIfNeeded() {
  const candidates = [
    element(by.text(METRO_URL)),
    element(by.text(/https?:\/\/[^\s]+:8081/)),
    element(by.text('Full Frills Balance')),
    element(by.label('Full Frills Balance')),
  ];

  for (const el of candidates) {
    try {
      await waitFor(el).toBeVisible().withTimeout(8000);
      await el.tap();
      return;
    } catch {
      // try next selector
    }
  }
}

export async function launchFreshApp() {
  await device.launchApp({
    newInstance: true,
    permissions: { notifications: 'YES' },
    url: DEV_CLIENT_URL,
  });

  await connectDevClientIfNeeded();
}

export async function ensureOnboarded(userName: string) {
  try {
    await waitFor(element(by.id('onboarding-name-input')))
      .toBeVisible()
      .withTimeout(120000);
    await completeOnboarding(userName);
    return;
  } catch {
    // Fresh install path failed or user already completed onboarding.
  }

  await waitFor(element(by.label('Dashboard, tab, 1 of 5')))
    .toBeVisible()
    .withTimeout(60000);
}

export async function completeOnboarding(userName: string) {
  await element(by.id('onboarding-name-input')).replaceText(userName);
  await element(by.id('onboarding-continue-button')).tap();

  await waitFor(element(by.id('selectable-grid-continue-button')))
    .toBeVisible()
    .withTimeout(15000);
  await element(by.id('selectable-grid-continue-button')).tap();

  await waitFor(element(by.id('selectable-grid-continue-button')))
    .toBeVisible()
    .withTimeout(15000);
  await element(by.id('selectable-grid-continue-button')).tap();

  await waitFor(element(by.id('selectable-grid-continue-button')))
    .toBeVisible()
    .withTimeout(15000);
  await element(by.id('selectable-grid-continue-button')).tap();

  await waitFor(element(by.id('onboarding-theme-continue-button')))
    .toBeVisible()
    .withTimeout(15000);
  await element(by.id('onboarding-theme-continue-button')).tap();

  await waitFor(element(by.id('onboarding-finish-button')))
    .toBeVisible()
    .withTimeout(15000);
  await element(by.id('onboarding-finish-button')).tap();

  await waitFor(element(by.text(`Hi, ${userName}`)))
    .toBeVisible()
    .withTimeout(120000);
}

export async function openBudgetFormFromCommitments() {
  await element(by.label('Commitments, tab, 3 of 5')).tap();
  await waitFor(element(by.label('Create a new budget')))
    .toBeVisible()
    .withTimeout(20000);
  await element(by.label('Create a new budget')).tap();
  await waitFor(element(by.id('budget-interval-type-item-DAILY')))
    .toBeVisible()
    .withTimeout(20000);
}

export async function selectBudgetInterval(interval: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY') {
  await element(by.id(`budget-interval-type-item-${interval}`)).tap();
}

export async function openSafeToSpendExplanation() {
  await element(by.label('Dashboard, tab, 1 of 5')).tap();
  await waitFor(element(by.text(/Hi,/)))
    .toBeVisible()
    .withTimeout(30000);
  await element(by.label('Open safe-to-spend calculation info')).tap();
  await waitFor(element(by.text('How Safe to Spend Is Calculated')))
    .toBeVisible()
    .withTimeout(15000);
}
