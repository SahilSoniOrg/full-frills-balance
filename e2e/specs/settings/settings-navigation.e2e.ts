import { device, element, by, expect } from 'detox';
import { assertTextVisible, assertVisibleById } from '../../actions/assertions';
import { launchOnboardedApp } from '../../actions/launch';
import { scrollToId, tapById } from '../../actions/mobile/elementActions';
import { openSettingsFromDrawer } from '../../actions/mobile/flows';
import { E2E_DEFAULT_WORKPLACE_LABEL } from '@/src/testing/e2eConstants';

jest.setTimeout(180000);

const notificationsTitle =
  device.getPlatform() === 'android' ? 'Notifications & Automation' : 'Notifications';

const settingsDestinations = [
  ['settings-profile', 'Profile'],
  ['settings-current-workplace', 'Current Workplace'],
  ['settings-appearance', 'Appearance'],
  ['settings-automation', notificationsTitle],
  ['settings-privacy-security', 'Privacy & Security'],
  ['settings-data-management', 'Data & Backup'],
  ['settings-maintenance', 'Maintenance'],
  ['settings-about-support', 'About & Support'],
] as const;

describe('Settings navigation', () => {
  it('renders the reorganized Settings root', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await openSettingsFromDrawer();
    await assertTextVisible('Settings', 30000);
    await assertTextVisible('PREFERENCES', 30000);
  });

  it('offers v2 workplace scope selection for exports', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await openSettingsFromDrawer();
    await tapById('settings-data-management');
    await assertTextVisible('Data & Backup', 30000);
    await tapById('data-export');
    await assertTextVisible('Filename', 30000);
    await device.takeScreenshot('settings-export-popup-spacing');
    await tapById('data-export-scope');
    await assertTextVisible('Backup scope', 30000);
    await assertTextVisible('This workplace', 30000);
    await assertTextVisible('All workplaces', 30000);
    await assertTextVisible('Choose workplaces', 30000);
  });

  it('shows the active workplace in the drawer and not in the screen header', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await expect(element(by.id('header-workplace-switcher'))).not.toBeVisible();
    await tapById('primary-navigation-header-trigger');
    await assertVisibleById('navigation-drawer-workplace-trigger');
    await assertTextVisible(E2E_DEFAULT_WORKPLACE_LABEL, 30000);
    await tapById('navigation-drawer-close');
    await expect(element(by.id('header-workplace-switcher'))).not.toBeVisible();
  });

  it.each(settingsDestinations)('opens %s', async (testID, title) => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await openSettingsFromDrawer();
    try {
      await tapById(testID);
    } catch {
      await scrollToId(testID);
      await tapById(testID);
    }
    await assertTextVisible(title, 30000);
    await assertVisibleById('nav-back-button', 30000);
  });

  it('opens Devices & Sessions from Profile', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await openSettingsFromDrawer();
    await tapById('settings-profile');
    await tapById('profile-devices-sessions');
    await assertVisibleById('device-other-devices-placeholder', 30000);
  });

  it('keeps future remote devices disabled inside Devices & Sessions', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await openSettingsFromDrawer();
    await tapById('settings-profile');
    await tapById('profile-devices-sessions');
    await element(by.id('device-other-devices-placeholder')).tap();
    await assertTextVisible('Devices & Sessions', 30000);
  });

  it('hides Android-only SMS settings on iOS', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await openSettingsFromDrawer();
    await tapById('settings-profile');
    await tapById('profile-devices-sessions');
    await expect(element(by.id('device-sms-import-unavailable'))).not.toBeVisible();
  });

  it('keeps App Lock under Privacy & Security', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await openSettingsFromDrawer();
    await tapById('settings-privacy-security');
    await assertVisibleById('settings-app-lock-toggle', 30000);
  });

  it('moves the Safe-to-Spend chart toggle to Appearance', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await openSettingsFromDrawer();
    await tapById('settings-appearance');
    await assertVisibleById('settings-sts-chart-toggle', 30000);
  });

  it('shows an explicit Create Workplace action', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await openSettingsFromDrawer();
    await tapById('settings-current-workplace');
    await tapById('current-workplace-workplaces');
    await assertVisibleById('create-workplace', 30000);
  });

  it('offers Create Workplace from the navigation drawer switcher', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await tapById('primary-navigation-header-trigger');
    await tapById('navigation-drawer-workplace-trigger');
    await tapById('navigation-drawer-create-workplace');
    await assertVisibleById('workplace-name-input', 30000);
  });
});
