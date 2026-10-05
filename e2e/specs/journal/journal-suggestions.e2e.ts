/**
 * @owner mobile
 * @dataSource e2e
 * @platform ios
 */
import { by, device, element, waitFor } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';
import { enterAmount } from '../../actions/mobile/enterAmount';
import { tabs } from '../../screens';

jest.setTimeout(300000);

describe(':ios: journal suggestions', () => {
  it('suggests a saved description and route, then applies it to a new entry', async () => {
    await launchOnboardedApp({ seedProfile: 'journal-suggestions' });
    await element(by.id(tabs.activity)).tap();
    await element(by.label('Open new entry options')).tap();
    await element(by.id('journal-entry-fab-expense')).tap();
    await waitFor(element(by.id('journal-entry-screen')))
      .toExist()
      .withTimeout(30000);

    const amountInput = element(by.id('hero-amount-input'));
    await amountInput.tap();
    await amountInput.typeText('12');
    await waitFor(amountInput).toHaveText('12').withTimeout(15000);

    await element(by.id('journal-description-input')).typeText('Detox grocery purchase');
    await element(by.id('journal-route-source-node')).tap();
    await waitFor(element(by.text('Bank')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.text('Bank')).tap();
    await element(by.id('journal-route-destination-node')).tap();
    await waitFor(element(by.text('Groceries')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.text('Groceries')).tap();

    await enterAmount('12');
    await element(by.id('submit-footer-button')).tap();
    await waitFor(element(by.text('Detox grocery purchase')))
      .toBeVisible()
      .withTimeout(30000);

    await element(by.label('Open new entry options')).tap();
    await element(by.id('journal-entry-fab-expense')).tap();
    await waitFor(element(by.id('journal-entry-screen')))
      .toExist()
      .withTimeout(30000);

    const descriptionInput = element(by.id('journal-description-input'));
    await descriptionInput.tap();
    await descriptionInput.typeText('Detox grocery');

    const suggestion = element(by.label('Detox grocery purchase, Bank to Groceries'));
    await waitFor(suggestion).toBeVisible().withTimeout(30000);
    await device.takeScreenshot('journal-suggestion-route-visible');

    await element(by.id('journal-suggestions-scroll-view')).swipe('up', 'slow', 0.5);
    const scrolledSuggestion = element(by.label('Detox grocery history item 5, Bank to Groceries'));
    await waitFor(scrolledSuggestion).toBeVisible().withTimeout(15000);
    await element(by.id('journal-suggestions-scroll-view')).swipe('down', 'slow', 0.5);
    await waitFor(suggestion).toBeVisible().withTimeout(15000);

    await element(by.id('simple-entry-scroll-view')).swipe('up', 'fast', 0.6);
    await waitFor(suggestion).not.toBeVisible().withTimeout(15000);
    await descriptionInput.tap();
    await waitFor(suggestion).toBeVisible().withTimeout(15000);
    await suggestion.tap();

    await waitFor(descriptionInput).toHaveText('Detox grocery purchase').withTimeout(15000);
    await waitFor(element(by.id('journal-route-source-node')))
      .toHaveLabel('Paid with: Bank')
      .withTimeout(15000);
    await waitFor(element(by.id('journal-route-destination-node')))
      .toHaveLabel('Spend on: Groceries')
      .withTimeout(15000);
    await device.takeScreenshot('journal-suggestion-route-applied');

    await element(by.id('journal-entry-mode-selector-trigger')).tap();
    await element(by.id('journal-entry-mode-batch')).tap();
    await waitFor(element(by.id('bulk-description-1')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.text('+ Add Entry Row')).tap();
    await waitFor(element(by.id('bulk-description-2')))
      .toExist()
      .withTimeout(15000);

    const batchDescription = element(by.id('bulk-description-1'));
    await batchDescription.tap();
    await batchDescription.typeText('Detox grocery');
    const batchSuggestion = element(by.label('Detox grocery purchase, Bank to Groceries'));
    await waitFor(batchSuggestion).toBeVisible().withTimeout(30000);
    await element(by.id('journal-suggestions-scroll-view')).swipe('up', 'slow', 0.5);
    const batchScrolledSuggestion = element(
      by.label('Detox grocery history item 5, Bank to Groceries'),
    );
    await waitFor(batchScrolledSuggestion).toBeVisible().withTimeout(15000);
    await element(by.id('bulk-entry-list')).swipe('up', 'fast', 0.5);
    await waitFor(batchSuggestion).not.toBeVisible().withTimeout(15000);
    await element(by.id('bulk-entry-list')).scrollTo('top');
    await batchDescription.tap();
    await waitFor(batchSuggestion).toBeVisible().withTimeout(15000);
    await batchSuggestion.tap();
    await waitFor(batchDescription).toHaveText('Detox grocery purchase').withTimeout(15000);
    await device.takeScreenshot('batch-suggestion-applied');

    for (const mode of ['allocation', 'expert'] as const) {
      await element(by.id('journal-entry-mode-selector-trigger')).tap();
      await element(by.id(`journal-entry-mode-${mode}`)).tap();
      const modeDescription = element(by.id('journal-description-input'));
      await modeDescription.replaceText('Detox grocery');
      const modeSuggestion = element(by.label('Detox grocery purchase, Bank to Groceries'));
      await waitFor(modeSuggestion).toBeVisible().withTimeout(15000);
      await element(by.id('journal-suggestions-scroll-view')).swipe('up', 'slow', 0.5);
      const modeScrolledSuggestion = element(
        by.label('Detox grocery history item 5, Bank to Groceries'),
      );
      await waitFor(modeScrolledSuggestion).toBeVisible().withTimeout(15000);
      await element(by.id('journal-entry-page-scroll-view')).swipe('up', 'fast', 0.5);
      await waitFor(modeSuggestion).not.toBeVisible().withTimeout(15000);
      await element(by.id('journal-entry-page-scroll-view')).scrollTo('top');
      await modeDescription.tap();
      await waitFor(modeSuggestion).toBeVisible().withTimeout(15000);
      await modeSuggestion.tap();
      await waitFor(modeDescription).toHaveText('Detox grocery purchase').withTimeout(15000);
    }
  });
});
