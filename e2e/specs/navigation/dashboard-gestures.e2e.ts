/**
 * @owner mobile
 * @dataSource e2e
 * @platform android
 */
import { by, device, element, expect, waitFor } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';

jest.setTimeout(180000);

const describeAndroid = device.getPlatform() === 'android' ? describe : describe.skip;

describeAndroid('Dashboard navigation gestures', () => {
  it('opens and closes the drawer, scrolls vertically, then pages left', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    const dashboard = element(by.id('dashboard-screen'));
    await waitFor(dashboard).toBeVisible().withTimeout(30000);

    // Android permits opening from any horizontal start position on Dashboard.
    await dashboard.swipe('right', 'slow', 0.7);
    await waitFor(element(by.id('navigation-drawer-close')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('navigation-drawer-surface')).swipe('left', 'slow', 0.7);
    await waitFor(element(by.id('navigation-drawer-close')))
      .not.toBeVisible()
      .withTimeout(10000);

    // A vertical gesture must remain a Dashboard scroll, not a horizontal transition.
    await dashboard.swipe('up', 'slow', 0.6);
    await expect(dashboard).toBeVisible();
    await expect(element(by.id('accounts-screen'))).not.toBeVisible();
    await expect(element(by.id('navigation-drawer-close'))).not.toBeVisible();

    // From Dashboard a leftward horizontal gesture advances to Accounts.
    await dashboard.swipe('left', 'slow', 0.7);
    await waitFor(element(by.id('accounts-screen')))
      .toBeVisible()
      .withTimeout(10000);
    await expect(dashboard).not.toBeVisible();
    await device.takeScreenshot('dashboard-left-page-swipe');
  });
});
