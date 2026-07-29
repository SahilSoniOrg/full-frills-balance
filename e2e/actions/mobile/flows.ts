import { element, by, waitFor } from 'detox';
import { budgets, accounts, dashboard, plannedPayments, tabs } from '../../screens';
import { LONG_TIMEOUT_MS } from '../../constants/timeouts';
import { assertVisibleById, assertTextVisible } from '../assertions';
import { tapById, tapByLabel, typeById } from './elementActions';

async function waitForAccountsHub(timeoutMs = LONG_TIMEOUT_MS): Promise<void> {
  await waitFor(element(by.id(accounts.fab)))
    .toBeVisible()
    .withTimeout(timeoutMs);
}

async function assertAccountNameOnList(name: string): Promise<void> {
  try {
    await assertTextVisible(name, 15000);
    return;
  } catch {
    await tapByLabel(/Assets section/);
    await assertTextVisible(name, LONG_TIMEOUT_MS);
  }
}

async function returnToMainTabs(): Promise<void> {
  const tab = element(by.id(dashboard.tab));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await waitFor(tab).toBeVisible().withTimeout(3000);
      return;
    } catch {
      try {
        await element(by.id('nav-back-button')).tap();
      } catch {
        break;
      }
    }
  }
  await waitFor(tab).toBeVisible().withTimeout(LONG_TIMEOUT_MS);
}

export async function openDashboardTab(): Promise<void> {
  await returnToMainTabs();
  await tapById(dashboard.tab, LONG_TIMEOUT_MS);
  await assertVisibleById(dashboard.screen);
}

export async function openActivityTab(): Promise<void> {
  await tapById(tabs.activity);
}

export async function openAccountsTab(): Promise<void> {
  await tapById(tabs.accounts);
}

export async function openCommitmentsTab(): Promise<void> {
  await tapById(tabs.commitments);
}

export async function createAssetAccount(name: string): Promise<void> {
  await openAccountsTab();
  await waitForAccountsHub();
  await tapById(accounts.fab);
  await typeById('hero-name-input', name);
  await element(by.id('hero-name-input')).tapReturnKey();
  await tapById(accounts.submitFooter, LONG_TIMEOUT_MS);
  await waitFor(element(by.id('hero-name-input')))
    .not.toBeVisible()
    .withTimeout(LONG_TIMEOUT_MS);
  await assertAccountNameOnList(name);
}

export async function openBudgetFormFromCommitments(): Promise<void> {
  await openCommitmentsTab();
  await tapByLabel('Create a new budget');
  await assertVisibleById(budgets.intervalItem('DAILY'));
}

export async function selectBudgetInterval(
  interval: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
): Promise<void> {
  await tapById(budgets.intervalItem(interval));
}

const SAFE_TO_SPEND_PROJECTED_GAP_COPY = 'safe-to-spend-unlocks-copy';

export async function openSafeToSpendExplanation(options?: {
  fromDashboard?: boolean;
}): Promise<void> {
  if (!options?.fromDashboard) {
    await openDashboardTab();
  }
  await tapByLabel('Open safe-to-spend calculation info');
  await assertTextVisible('How Safe to Spend Is Calculated');
  await assertVisibleById(SAFE_TO_SPEND_PROJECTED_GAP_COPY, LONG_TIMEOUT_MS);
}

export { SAFE_TO_SPEND_PROJECTED_GAP_COPY };

export async function createPlannedPayment(name: string, amount: string): Promise<void> {
  await openCommitmentsTab();
  await tapById('commitments-tabs-item-planned');
  await tapByLabel('Create a new planned payment');
  await typeById(plannedPayments.heroName, name);
  await typeById(plannedPayments.heroAmount, amount);
  await tapById(plannedPayments.fromAccount);
  await tapByLabel(/^Checking Account/);
  await tapById(plannedPayments.toAccount);
  await tapByLabel(/^Landlord/);
  await tapById(plannedPayments.submitFooter);
  await assertTextVisible(name);
}
