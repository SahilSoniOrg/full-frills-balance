import { by, device, element, expect, waitFor } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';
import { enterAmount } from '../../actions/mobile/enterAmount';
import { createFxSplitExpense } from '../../actions/mobile/journalFxSplitExpense';
import { tapById, tapByLabel } from '../../actions/mobile/elementActions';
import { navigation, tabs } from '../../screens';

jest.setTimeout(300000);

describe(':ios: F-01 historical currency valuation review', () => {
  it('shows a converted foreign expense in reports, budget details, and Safe to Spend', async () => {
    await launchOnboardedApp({ seedProfile: 'fx-demo' });
    await createFxSplitExpense('F01 Euro market purchase');

    await tapById(tabs.activity);
    await tapById(navigation.headerTrigger);
    await tapByLabel('Reports');
    const reportExpenseAmount = element(by.text('$11.00')).atIndex(0);
    await waitFor(reportExpenseAmount).toBeVisible().withTimeout(30000);
    await expect(reportExpenseAmount).toBeVisible();
    await device.takeScreenshot('f01-reports-overview');

    await tapById('report-tabs-item-SPENDING');
    await waitFor(element(by.id('report-spending-by-category')))
      .toBeVisible()
      .withTimeout(15000);
    await device.takeScreenshot('f01-reports-spending');

    await tapById('nav-back-button');
    await tapById(tabs.commitments);
    await tapByLabel('Add budget');
    await createFoodBudget();
    await tapByLabel('F01 Food Budget');
    await waitFor(element(by.text('F01 Food Budget')))
      .toBeVisible()
      .withTimeout(30000);
    await element(by.id('journal-entry-list')).scrollTo('bottom');
    await waitFor(element(by.text('F01 Euro market purchase')))
      .toBeVisible()
      .withTimeout(15000);
    await device.takeScreenshot('f01-budget-details');

    await tapById('nav-back-button');
    await tapById('tab-dashboard');
    await waitFor(element(by.id('safe-to-spend-amount')))
      .toBeVisible()
      .withTimeout(30000);
    await device.takeScreenshot('f01-safe-to-spend');
    await tapByLabel('Open safe-to-spend calculation info');
    await waitFor(element(by.id('safe-to-spend-unlocks-copy')))
      .toBeVisible()
      .withTimeout(15000);
    await expect(element(by.id('safe-to-spend-cash-available-row'))).toHaveLabel(
      'Cash available now, $11.37',
    );
    await device.takeScreenshot('f01-safe-to-spend-explanation');
  });
});

async function createFoodBudget(): Promise<void> {
  await element(by.id('hero-name-input')).typeText('F01 Food Budget');
  await element(by.id('hero-name-input')).tapReturnKey();
  await enterAmount('150', 'hero-amount-input');
  await tapByLabel('Food & Drink category', 15000);
  await tapById('submit-footer-button');
  await waitFor(element(by.label('F01 Food Budget')))
    .toBeVisible()
    .withTimeout(30000);
}
