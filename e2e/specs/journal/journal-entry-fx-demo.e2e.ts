/**
 * @owner mobile
 * @dataSource e2e
 * @platform ios
 */
import { by, device, element, waitFor } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';
import { tabs } from '../../screens';

jest.setTimeout(300000);

describe(':ios: FX journal entry demo', () => {
  it('creates and saves a split expense across EUR and USD', async () => {
    await launchOnboardedApp({ seedProfile: 'fx-demo' });
    await element(by.id(tabs.activity)).tap();
    await element(by.label('Open new entry options')).tap();
    await element(by.id('journal-entry-fab-expense')).tap();

    await waitFor(element(by.id('journal-entry-screen')))
      .toExist()
      .withTimeout(30000);
    await element(by.id('amount-calculator-close')).tap();
    await element(by.id('journal-entry-mode-selector-trigger')).tap();
    await element(by.id('journal-entry-mode-allocation')).tap();

    await element(by.id('journal-description-input')).typeText('Euro market purchase');

    await element(by.id('split-source-picker-source-node')).tap();
    await waitFor(element(by.text('Euro Wallet')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.text('Euro Wallet')).tap();

    await element(by.id('split-category-picker-1-source-node')).tap();
    await waitFor(element(by.text('Food & Drink')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.text('Food & Drink')).tap();

    await enterAmount('split-total-amount-input', '10');
    await enterAmount('split-amount-input-1', '10');
    const convertedAmount = element(by.id('split-fx-1-converted-amount-input'));
    await waitFor(convertedAmount).toBeVisible().withTimeout(30000);
    await convertedAmount.replaceText('11.00');

    await element(by.id('submit-footer-button')).tap();
    await waitFor(element(by.text('Euro market purchase')))
      .toBeVisible()
      .withTimeout(30000);
    await device.takeScreenshot('journal-entry-fx-demo-saved');
  });
});

async function enterAmount(testID: string, digits: string): Promise<void> {
  await element(by.id(`${testID}-calculator`)).tap();
  for (const digit of digits) {
    await element(by.id(`amount-calculator-key-${digit}`)).tap();
  }
  await element(by.id('amount-calculator-done')).tap();
}
