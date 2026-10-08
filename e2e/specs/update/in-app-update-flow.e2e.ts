import { by, device, element, expect, waitFor } from 'detox';
import { launchWithUpdateGate, waitForDashboard } from '../../actions/launch';
import { tabs, dashboard } from '../../screens';

jest.setTimeout(180000);

/** Brief holds make the requested recording readable; normal test runs skip them. */
async function showScreen() {
  if (process.env.DETOX_RECORD_VIDEO === '1')
    await new Promise(resolve => setTimeout(resolve, 1400));
}

async function launch(
  flow: 'download' | 'cancel' | 'failure' | 'downloaded' | 'install-failure',
  seedProfile: 'onboarded' | 'journal-ready' = 'onboarded',
) {
  await launchWithUpdateGate('available', { flow, seedProfile });
  await device.disableSynchronization();
  await waitForDashboard();
}

async function startUpdate() {
  await waitFor(element(by.text('UPDATE NOW')))
    .toBeVisible()
    .withTimeout(30000);
  await showScreen();
  await element(by.text('UPDATE NOW')).tap();
}

describe(':android: mocked Play update flow', () => {
  it('downloads while the app stays usable, then installs only after Restart', async () => {
    await launch('download');
    await startUpdate();
    await waitFor(element(by.text('Mock Play update')))
      .toBeVisible()
      .withTimeout(15000);
    await showScreen();
    await element(by.text('Download')).tap();
    await waitFor(element(by.id('update-download-status')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id(tabs.accounts)).tap();
    await showScreen();
    await element(by.id(dashboard.tab)).tap();
    await waitFor(element(by.id('update-restart')))
      .toBeVisible()
      .withTimeout(20000);
    await showScreen();
    await waitFor(element(by.text('A newer version of Full Frills Balance is available.')))
      .not.toExist()
      .withTimeout(5000);
    await device.takeScreenshot('update-ready-toast-readable');
    await element(by.id('update-restart')).tap();
    await waitFor(element(by.id('update-download-status')))
      .not.toExist()
      .withTimeout(10000);
    await expect(element(by.id(dashboard.tab))).toBeVisible();
    await showScreen();
    await device.takeScreenshot('update-complete');
  });

  it('lets the user cancel the Play prompt without blocking their books', async () => {
    await launch('cancel');
    await startUpdate();
    await waitFor(element(by.text('Mock Play update')))
      .toBeVisible()
      .withTimeout(15000);
    await showScreen();
    await element(by.text('Cancel')).tap();
    await expect(element(by.id('update-download-status'))).not.toExist();
    await expect(element(by.id(dashboard.tab))).toBeVisible();
    await element(by.id(tabs.accounts)).tap();
    await showScreen();
    await device.takeScreenshot('update-cancelled');
  });

  it('uses the store fallback when the native update cannot start', async () => {
    await launch('failure');
    await startUpdate();
    await waitFor(element(by.text('Mock store fallback')))
      .toBeVisible()
      .withTimeout(15000);
    await showScreen();
    await device.takeScreenshot('update-store-fallback');
    await element(by.text('OK')).tap();
    await expect(element(by.id(dashboard.tab))).toBeVisible();
    await showScreen();
  });

  it('keeps the downloaded update ready after an installation failure and supports retry', async () => {
    await launch('install-failure');
    await waitFor(element(by.id('update-restart')))
      .toBeVisible()
      .withTimeout(30000);
    await showScreen();
    await device.takeScreenshot('update-ready-toast-readable');
    await element(by.id('update-restart')).tap();
    await waitFor(element(by.text('The update could not be installed. Try again.')))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.id('update-restart'))).toBeVisible();
    await showScreen();
    await element(by.id('update-restart')).tap();
    await waitFor(element(by.id('update-download-status')))
      .not.toExist()
      .withTimeout(10000);
    await showScreen();
    await device.takeScreenshot('update-install-retry-complete');
  });

  it('protects an unsaved journal entry from restarting for an update', async () => {
    await launch('downloaded', 'journal-ready');
    await waitFor(element(by.id('update-restart')))
      .toBeVisible()
      .withTimeout(30000);
    // The long-lived demo toast covers the form's first field on this small emulator.
    await element(by.text('RESTART TO UPDATE')).swipe('up');
    await element(by.id(tabs.activity)).tap();
    await element(by.label('Open new entry options')).tap();
    await element(by.id('journal-entry-fab-expense')).tap();
    await waitFor(element(by.id('hero-amount-input')))
      .toBeFocused()
      .withTimeout(10000);
    await element(by.id('hero-amount-input')).replaceText('12');
    await device.pressBack();
    await showScreen();
    await element(by.id('update-restart')).tap();
    await waitFor(element(by.text('Save or discard your changes before restarting to update.')))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.id('hero-amount-input'))).toHaveText('12');
    await expect(element(by.id('update-restart'))).toBeVisible();
    await showScreen();
    await device.takeScreenshot('update-unsaved-entry-protected');
  });
});
