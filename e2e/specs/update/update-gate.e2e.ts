import { by, element, expect, waitFor } from 'detox';
import { launchWithUpdateGate } from '../../actions/launch';

jest.setTimeout(180000);

describe('Mandatory update gate', () => {
  it('renders the blocking update screen with a backup option', async () => {
    await launchWithUpdateGate('required');

    await waitFor(element(by.id('update-required-title')))
      .toBeVisible()
      .withTimeout(120000);
    await expect(element(by.id('update-export-backup'))).toBeVisible();
    await expect(element(by.id('update-now'))).toBeVisible();
    await expect(element(by.id('update-view-changelog'))).toBeVisible();
    await element(by.id('update-view-changelog')).tap();
    await expect(element(by.text("What's new"))).toBeVisible();
    await expect(element(by.id('update-changelog-item-0'))).toBeVisible();
    await element(by.id('update-close-changelog')).tap();
    await element(by.id('update-export-backup')).tap();
    await expect(element(by.text('Backup scope'))).toBeVisible();
    await expect(element(by.text('All workplaces'))).toBeVisible();
    await element(by.text('Choose workplaces')).tap();
    await expect(element(by.text('Export backup'))).toBeVisible();
  });
});

describe('Available update notice', () => {
  it('moves the update notice into Hub when swiped away', async () => {
    await launchWithUpdateGate('available');

    await waitFor(element(by.text('A newer version of Full Frills Balance is available.')))
      .toBeVisible()
      .withTimeout(120000);
    await expect(element(by.text('UPDATE NOW'))).toBeVisible();

    // Swipe the toast surface that owns the dismiss pan responder, not the
    // inner text. A short swipe does not travel far enough to cross the
    // dismiss threshold.
    await element(by.id('app-toast')).swipe('up', 'slow', 0.9);
    await expect(
      element(by.text('A newer version of Full Frills Balance is available.')),
    ).not.toBeVisible();

    await element(by.label('View Notifications')).tap();
    await waitFor(element(by.text('A newer version of Full Frills Balance is available.')))
      .toBeVisible()
      .withTimeout(30000);
    await expect(element(by.text('Update now'))).toBeVisible();
  });
});
