import { by, element, waitFor } from 'detox';
import { tapById, tapByLabel, tapByText } from './elementActions';
import { enterAmount } from './enterAmount';
import { tabs } from '../../screens';

export async function createFxSplitExpense(description: string): Promise<void> {
  await tapById(tabs.activity);
  await tapByLabel('Open new entry options');
  await tapById('journal-entry-fab-expense');
  await waitFor(element(by.id('journal-entry-screen')))
    .toExist()
    .withTimeout(30000);
  await element(by.id('hero-amount-input')).tapReturnKey();
  await tapById('journal-entry-mode-selector-trigger');
  await tapById('journal-entry-mode-allocation');
  await element(by.id('journal-description-input')).typeText(description);

  await tapById('split-source-picker-source-node');
  await tapByText('Euro Wallet', 15000);
  await tapById('split-category-picker-1-source-node');
  await tapByText('Food & Drink', 15000);

  await enterAmount('10', 'split-total-amount-input');
  await enterAmount('11', 'split-amount-input-1');
  const convertedAmount = element(by.id('split-source-fx-converted-amount-input'));
  await waitFor(convertedAmount).toBeVisible().withTimeout(30000);

  await tapById('submit-footer-button');
  await waitFor(element(by.text(description)))
    .toBeVisible()
    .withTimeout(30000);
}
