/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { by, device, element, expect } from 'detox';
import { E2E_AUTH_TOKEN } from '../../utils/launchArgs';

jest.setTimeout(180000);

it('restores selected workplaces and returns to the workplace selector', async () => {
  await device.launchApp({
    newInstance: true,
    delete: true,
    permissions: { notifications: 'YES' },
    launchArgs: {
      e2eAuth: E2E_AUTH_TOKEN,
      e2eReset: '1',
      e2eSeedProfile: 'bulk-restore',
    },
  });
  await device.disableSynchronization();
  await new Promise(resolve => setTimeout(resolve, 30000));
  await expect(element(by.id('restore-summary-slice'))).toExist();
  await expect(element(by.text('Restore is ready'))).toExist();
  await device.takeScreenshot('bulk-restore-ready');
  await element(by.id('restore-summary-continue')).tap();
  await expect(element(by.id('onboarding-theme-continue-button'))).toExist();
  await element(by.id('onboarding-theme-continue-button')).tap();
  await expect(element(by.id('onboarding-summary-step'))).toExist();
  await element(by.id('onboarding-finish-button')).tap();

  await new Promise(resolve => setTimeout(resolve, 15000));
  await expect(element(by.id('workplace-picker-screen'))).toExist();
  await expect(element(by.text('Imported Books'))).toExist();
  await expect(element(by.text('Imported Books 2'))).toExist();
  await device.takeScreenshot('bulk-restore-workplace-picker');
});
