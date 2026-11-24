import { by, element, expect, waitFor } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';
import { tapById, tapByLabel } from '../../actions/mobile/elementActions';
import { openCommitmentsTab } from '../../actions/mobile/flows';
import { DEFAULT_TIMEOUT_MS, LONG_TIMEOUT_MS } from '../../constants/timeouts';

describe('Budget activity selection', () => {
  it('deselects both rows of a split journal with Toggle all', async () => {
    await launchOnboardedApp({ seedProfile: 'budget-split-selection' });
    await openCommitmentsTab();
    await tapById('home-v2-subtab-commitments-commitments', LONG_TIMEOUT_MS);
    await tapByLabel(/^Split selection budget.*/, LONG_TIMEOUT_MS);

    const groceriesRow = by.label(/^Split budget purchase\..*\$20\. To Groceries\..*/);
    const foodRow = by.label(/^Split budget purchase\..*\$10\. To Food & Drink\..*/);
    const activityList = element(by.id('journal-entry-list'));
    await waitFor(activityList).toBeVisible().withTimeout(LONG_TIMEOUT_MS);
    await activityList.scrollTo('bottom');
    const groceriesCard = element(groceriesRow);
    await waitFor(groceriesCard).toBeVisible().withTimeout(DEFAULT_TIMEOUT_MS);
    await waitFor(element(foodRow)).toBeVisible().withTimeout(DEFAULT_TIMEOUT_MS);

    const groceriesOutline = element(
      by.id('journal-entry-card-selection-outline').withAncestor(groceriesRow),
    );
    const foodOutline = element(
      by.id('journal-entry-card-selection-outline').withAncestor(foodRow),
    );

    await groceriesCard.longPress(600);
    // Android appends the checkbox's mixed state to its label.
    const toggleAll = element(by.label(/^Toggle all(?:, .*)?$/));
    await waitFor(toggleAll).toBeVisible().withTimeout(DEFAULT_TIMEOUT_MS);
    await groceriesCard.tap();
    await expect(groceriesOutline).not.toExist();
    await expect(foodOutline).not.toExist();

    await toggleAll.tap();
    await expect(groceriesOutline).toExist();
    await expect(foodOutline).toExist();

    await toggleAll.tap();
    await expect(groceriesOutline).not.toExist();
    await expect(foodOutline).not.toExist();
    await expect(toggleAll).toBeVisible();
  });
});
