/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { by, device, element, expect } from 'detox';
import { E2E_AUTH_TOKEN } from '../../utils/launchArgs';

jest.setTimeout(180000);

it('shows the multi-workplace restore selector', async () => {
  await device.launchApp({
    newInstance: true,
    delete: true,
    permissions: { notifications: 'YES' },
    launchArgs: {
      e2eAuth: E2E_AUTH_TOKEN,
      e2eReset: '1',
      e2eSeedProfile: 'bulk-restore-selection',
    },
  });

  await expect(element(by.text('Restore workplaces'))).toBeVisible();
  await expect(element(by.text('Personal'))).toExist();
  await expect(element(by.text('Freelance'))).toExist();
  await expect(element(by.text('Side project'))).toExist();
  await device.takeScreenshot('bulk-restore-selection-all');

  await element(by.id('restore-workplace-option-1')).tap();
  await expect(element(by.text('Save 2 workplaces'))).toBeVisible();
  await device.takeScreenshot('bulk-restore-selection-custom');
});
