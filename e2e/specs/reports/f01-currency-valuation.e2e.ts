/**
 * @owner mobile
 * @dataSource e2e
 * @platform ios
 */
import { by, device, element, expect, waitFor } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';
import { tapById, tapByLabel, tapByText } from '../../actions/mobile/elementActions';
import { tabs } from '../../screens';

jest.setTimeout(300000);

describe(':ios: F-01 historical currency valuation review', () => {
  it('shows a converted foreign expense in reports, budget details, and Safe to Spend', async () => {
    await launchOnboardedApp({ seedProfile: 'fx-demo' });
    await createForeignExpense();

    await tapById(tabs.activity);
    await tapByLabel('View Analytics');
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
    await tapByLabel('Create a new budget');
    await createFoodBudget();
    await tapByLabel('F01 Food Budget');
    await waitFor(element(by.text('Budget Details')))
      .toBeVisible()
      .withTimeout(30000);
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
    await tapByText('Cash you have', 15000);
    await waitFor(element(by.text('$11.37')))
      .toBeVisible()
      .withTimeout(15000);
    await device.takeScreenshot('f01-safe-to-spend-explanation');
  });
});

async function createForeignExpense(): Promise<void> {
  await tapById(tabs.activity);
  await tapByLabel('Open new entry options');
  await tapById('journal-entry-fab-expense');
  await waitFor(element(by.id('journal-entry-screen')))
    .toExist()
    .withTimeout(30000);
  await tapById('amount-calculator-close');
  await tapById('journal-entry-mode-selector-trigger');
  await tapById('journal-entry-mode-allocation');
  await element(by.id('journal-description-input')).typeText('F01 Euro market purchase');

  await tapById('split-source-picker-source-node');
  await tapByText('Euro Wallet', 15000);
  await tapById('split-category-picker-1-source-node');
  await tapByText('Food & Drink', 15000);

  await enterAmount('split-total-amount-input', '10');
  await enterAmount('split-amount-input-1', '10');
  const convertedAmount = element(by.id('split-fx-1-converted-amount-input'));
  await waitFor(convertedAmount).toBeVisible().withTimeout(30000);
  await convertedAmount.replaceText('11.00');

  await tapById('submit-footer-button');
  await waitFor(element(by.text('F01 Euro market purchase')))
    .toBeVisible()
    .withTimeout(30000);
}

async function createFoodBudget(): Promise<void> {
  await element(by.id('hero-name-input')).typeText('F01 Food Budget');
  await element(by.id('hero-name-input')).tapReturnKey();
  await enterAmount('hero-amount-input', '150');
  await tapByText('Select categories', 15000);
  await tapByText('Food & Drink', 15000);
  await tapByText('Apply Selection (1)', 15000);
  await tapById('submit-footer-button');
  await waitFor(element(by.label('F01 Food Budget')))
    .toBeVisible()
    .withTimeout(30000);
}

async function enterAmount(testID: string, digits: string): Promise<void> {
  await tapById(`${testID}-calculator`);
  for (const digit of digits) {
    await tapById(`amount-calculator-key-${digit}`);
  }
  await tapById('amount-calculator-done');
}
