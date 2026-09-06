/**
 * @owner mobile
 * @dataSource e2e
 * @platform android
 */
import { by, element, waitFor } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';
import { LONG_TIMEOUT_MS } from '../../constants/timeouts';
import { tabs } from '../../screens';

jest.setTimeout(300000);

describe(':android: merged journal edit', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'merge-edit' });
    await element(by.id(tabs.activity)).tap();
  });

  it('keeps every SMS leg after merge, rename, and edit', async () => {
    const food = element(by.text('SMS Food'));
    const groceries = element(by.text('SMS Groceries'));
    const sports = element(by.text('SMS Sports'));

    await waitFor(groceries).toBeVisible().withTimeout(LONG_TIMEOUT_MS);
    await waitFor(sports).toBeVisible().withTimeout(LONG_TIMEOUT_MS);

    // Enter selection with the same long-press path a user uses, then select the other two.
    await sports.longPress(600);
    await groceries.tap();
    await element(by.id('journal-entry-card')).atIndex(0).swipe('up', 'fast', 0.75);
    await waitFor(food).toBeVisible().withTimeout(LONG_TIMEOUT_MS);
    await food.tap();
    await element(by.label('More bulk actions')).tap();
    await element(by.label('Merge selected transactions')).tap();

    await waitFor(element(by.text('Consolidated Legs (4)')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await element(by.id('merge-journals-modal-confirm')).tap();

    const mergedTitle = element(by.text('Merged: SMS Sports, SMS Groceries, SMS Food'));
    await waitFor(mergedTitle).toBeVisible().withTimeout(LONG_TIMEOUT_MS);
    await mergedTitle.tap();
    await waitFor(element(by.id('edit-button')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await element(by.id('edit-button')).tap();

    await waitFor(element(by.text('Journal Lines')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await element(by.id('journal-description-input')).replaceText('Merged SMS expenses');
    await element(by.id('submit-footer-button')).tap();

    await waitFor(element(by.text('Merged SMS expenses')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.text('Bank')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.text('Food & Drink')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.text('Groceries')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.text('Sports')))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
  });
});
