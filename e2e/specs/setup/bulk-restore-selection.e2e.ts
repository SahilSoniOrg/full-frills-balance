import { by, device, element, expect } from 'detox';
import { launchSeedProfileApp } from '../../actions/launch';

jest.setTimeout(180000);

it('shows the multi-workplace restore selector', async () => {
  await launchSeedProfileApp('bulk-restore-selection');

  await expect(element(by.text('Restore workplaces'))).toBeVisible();
  await expect(element(by.text('Personal'))).toExist();
  await expect(element(by.text('Freelance'))).toExist();
  await expect(element(by.text('Side project'))).toExist();
  await device.takeScreenshot('bulk-restore-selection-all');

  await element(by.id('restore-workplace-option-1')).tap();
  await expect(element(by.text('Save 2 workplaces'))).toBeVisible();
  await device.takeScreenshot('bulk-restore-selection-custom');
});
