/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { by, device, element, expect } from 'detox';
import { launchOnboardedApp } from '../../actions/launch';
import { tapById } from '../../actions/mobile/elementActions';
import { tabs } from '../../screens';

jest.setTimeout(180000);

it('restores multiple workplaces from Settings through the shared setup flow', async () => {
  await launchOnboardedApp({ seedProfile: 'settings-bulk-restore' });
  await tapById(tabs.settings);
  await tapById('settings-data-management');
  await expect(element(by.text('Data & Backup'))).toBeVisible();
  await tapById('data-import');

  await expect(element(by.text('Restore workplaces'))).toBeVisible();
  await expect(element(by.text('Imported Books'))).toExist();
  await expect(element(by.text('Imported Books 2'))).toExist();
  await device.takeScreenshot('settings-bulk-restore-selection');

  await tapById('restore-selected-workplaces');
  await expect(element(by.id('restore-summary-slice'))).toExist();
  await expect(element(by.text('Imported Books'))).toBeVisible();
  await expect(element(by.text('Imported Books 2'))).toBeVisible();
  await device.takeScreenshot('settings-bulk-restore-ready');

  await tapById('restore-summary-open');
  await new Promise(resolve => setTimeout(resolve, 15000));
  await expect(element(by.id('workplace-picker-screen'))).toBeVisible();
  await expect(element(by.text('Imported Books'))).toBeVisible();
  await expect(element(by.text('Imported Books 2'))).toBeVisible();
  await device.takeScreenshot('settings-bulk-restore-workplace-picker');
});
