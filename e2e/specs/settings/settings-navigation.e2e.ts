/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { device, element, by, expect } from 'detox';
import { assertTextVisible, assertVisibleById } from '../../actions/assertions';
import { launchOnboardedApp } from '../../actions/launch';
import { scrollToId, tapById } from '../../actions/mobile/elementActions';
import { tabs } from '../../screens';

jest.setTimeout(180000);

const notificationsTitle =
  device.getPlatform() === 'android' ? 'Notifications & Automation' : 'Reminders';

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
    await tapById(tabs.settings);
    await assertTextVisible('Settings', 30000);
    await expect(element(by.id('header-workplace-switcher'))).toBeVisible();
    await assertTextVisible('Preferences', 30000);
  });

  it('keeps the workplace switcher on Settings but out of other screens', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await expect(element(by.id('header-workplace-switcher'))).not.toBeVisible();

    await tapById(tabs.settings);
    await expect(element(by.id('header-workplace-switcher'))).toBeVisible();

    await tapById('settings-current-workplace');
    await expect(element(by.id('header-workplace-switcher'))).not.toBeVisible();
  });

  it.each(settingsDestinations)('opens %s', async (testID, title) => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await tapById(tabs.settings);
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
    await tapById(tabs.settings);
    await tapById('settings-profile');
    await tapById('profile-devices-sessions');
    await assertVisibleById('device-other-devices-placeholder', 30000);
  });

  it('keeps future remote devices disabled inside Devices & Sessions', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await tapById(tabs.settings);
    await tapById('settings-profile');
    await tapById('profile-devices-sessions');
    await element(by.id('device-other-devices-placeholder')).tap();
    await assertTextVisible('Devices & Sessions', 30000);
  });

  it('hides Android-only SMS settings on iOS', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await tapById(tabs.settings);
    await tapById('settings-profile');
    await tapById('profile-devices-sessions');
    await expect(element(by.id('device-sms-import-unavailable'))).not.toBeVisible();
  });

  it('keeps App Lock under Privacy & Security', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await tapById(tabs.settings);
    await tapById('settings-privacy-security');
    await assertVisibleById('settings-app-lock-toggle', 30000);
  });

  it('moves the Safe-to-Spend chart toggle to Appearance', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await tapById(tabs.settings);
    await tapById('settings-appearance');
    await assertVisibleById('settings-sts-chart-toggle', 30000);
  });

  it('shows an explicit Create Workplace action', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await tapById(tabs.settings);
    await tapById('settings-current-workplace');
    await tapById('current-workplace-workplaces');
    await assertVisibleById('create-workplace', 30000);
  });

  it('offers Create Workplace from the Settings workplace switcher', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await tapById(tabs.settings);
    await tapById('header-workplace-switcher');
    await assertVisibleById('workplace-switcher-create', 30000);
  });
});
