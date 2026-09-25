/**
 * @owner mobile
 * @dataSource e2e
 * @platform ios
 */
import { by, device, element, expect, waitFor } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';

jest.setTimeout(300000);

describe(':ios: F-02 missing FX handling', () => {
  it('refreshes a missing current FX rate and offers manual entry if it remains unavailable', async () => {
    await launchOnboardedApp({ seedProfile: 'fx-missing-rate' });

    await waitFor(element(by.id('safe-to-spend-card-layout')))
      .toBeVisible()
      .withTimeout(30000);
    await waitFor(
      element(by.text('Some values could not be converted. Safe to Spend may be incomplete.')),
    )
      .toBeVisible()
      .withTimeout(30000);

    await expect(element(by.id('safe-to-spend-incomplete-warning'))).toBeVisible();
    await device.takeScreenshot('f02-missing-fx-dashboard-warning');
    await element(by.id('safe-to-spend-incomplete-warning')).tap();

    await waitFor(element(by.text('Why this estimate is incomplete')))
      .toBeVisible()
      .withTimeout(15000);
    await waitFor(element(by.text('Euro Wallet: €20.00 was not included.')))
      .toBeVisible()
      .withTimeout(15000);
    await waitFor(element(by.text('No current EUR → USD exchange rate is available.')))
      .toBeVisible()
      .withTimeout(15000);

    await expect(element(by.text('Available'))).not.toExist();
    await device.takeScreenshot('f02-missing-fx-details-popup');

    await element(by.text('Refresh rates')).tap();
    await device.takeScreenshot('f02-missing-fx-refreshing');

    try {
      await waitFor(element(by.text('Why this estimate is incomplete')))
        .not.toExist()
        .withTimeout(60000);
      await device.takeScreenshot('f02-missing-fx-refreshed');
    } catch {
      await waitFor(element(by.id('incomplete-fx-manual-rate-eur-usd')))
        .toBeVisible()
        .withTimeout(15000);
      await device.takeScreenshot('f02-missing-fx-refresh-fallback');
    }
  });
});
