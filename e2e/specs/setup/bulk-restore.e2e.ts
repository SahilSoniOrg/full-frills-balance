import { by, device, element, expect } from 'detox';
import { launchSeedProfileApp, relaunchSameInstance } from '../../actions/launch';

jest.setTimeout(180000);

it('restores selected workplaces and returns to the workplace selector', async () => {
  await launchSeedProfileApp('bulk-restore', { disableSynchronization: true });
  await new Promise(resolve => setTimeout(resolve, 30000));
  await expect(element(by.id('restore-summary-slice'))).toExist();
  await expect(element(by.text('Restore is ready'))).toExist();
  await expect(element(by.text('Imported Books'))).toExist();
  await expect(element(by.text('Imported Books 2'))).toExist();
  await device.takeScreenshot('bulk-restore-ready');
  await element(by.id('restore-summary-continue')).tap();
  await new Promise(resolve => setTimeout(resolve, 5000));
  await expect(element(by.id('onboarding-summary-step'))).toExist();
  await element(by.id('onboarding-finish-button')).tap();

  await new Promise(resolve => setTimeout(resolve, 15000));
  await expect(element(by.id('workplace-picker-screen'))).toExist();
  await expect(element(by.text('Imported Books'))).toExist();
  await expect(element(by.text('Imported Books 2'))).toExist();
  await device.takeScreenshot('bulk-restore-workplace-picker');

  await device.terminateApp();
  await relaunchSameInstance();
  await new Promise(resolve => setTimeout(resolve, 15000));
  await expect(element(by.id('workplace-picker-screen'))).toExist();
  await expect(element(by.text('Imported Books'))).toExist();
  await expect(element(by.text('Imported Books 2'))).toExist();
});
