import { element, by, expect } from 'detox';
import {
  completeOnboarding,
  launchFreshApp,
  openBudgetFormFromCommitments,
  openSafeToSpendExplanation,
  selectBudgetInterval,
} from './helpers/flows';

describe('Budgets (native)', () => {
  beforeAll(async () => {
    await launchFreshApp();
    await completeOnboarding('Detox Budget User');
  });

  it('shows daily interval and amount label on the budget form', async () => {
    await openBudgetFormFromCommitments();
    await selectBudgetInterval('DAILY');
    await expect(element(by.text(/Daily Amount/i))).toBeVisible();
    await selectBudgetInterval('MONTHLY');
    await expect(element(by.text(/Monthly Amount/i))).toBeVisible();
  });
});

describe('Safe to Spend copy (native)', () => {
  beforeAll(async () => {
    await launchFreshApp();
    await completeOnboarding('Detox STS User');
  });

  it('explains projected gap when budgets use most of cash', async () => {
    await openSafeToSpendExplanation();
    await expect(
      element(by.text(/projected gap even when your accounts are not overdrawn/i)),
    ).toBeVisible();
  });
});
