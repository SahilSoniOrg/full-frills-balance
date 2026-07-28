import { element, by, expect } from 'detox';
import {
  ensureOnboarded,
  launchFreshApp,
  openBudgetFormFromCommitments,
  openSafeToSpendExplanation,
  selectBudgetInterval,
} from './helpers/flows';

jest.setTimeout(300000);

describe('Native budgets and Safe to Spend', () => {
  beforeAll(async () => {
    await launchFreshApp();
    await ensureOnboarded('Detox User');
  });

  it('shows daily interval and amount label on the budget form', async () => {
    await openBudgetFormFromCommitments();
    await selectBudgetInterval('DAILY');
    await expect(element(by.text(/Daily Amount/i))).toBeVisible();
    await selectBudgetInterval('MONTHLY');
    await expect(element(by.text(/Monthly Amount/i))).toBeVisible();
  });

  it('explains projected gap when budgets use most of cash', async () => {
    await openSafeToSpendExplanation();
    await expect(
      element(by.text(/projected gap even when your accounts are not overdrawn/i)),
    ).toBeVisible();
  });
});
