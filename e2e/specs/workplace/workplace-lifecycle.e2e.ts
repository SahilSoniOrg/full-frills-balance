/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { assertVisibleById } from '../../actions/assertions';
import { launchOnboardedApp } from '../../actions/launch';
import { replaceById, tapById, tapByLabel } from '../../actions/mobile/elementActions';
import { tabs } from '../../screens';
import { by, element } from 'detox';

jest.setTimeout(180000);

describe('Workplace lifecycle', () => {
  it('deletes the last Workplace and returns to setup', async () => {
    const workplaceName = "E2E User's Personal workplace";

    await launchOnboardedApp({ seedProfile: 'onboarded' });
    await tapById(tabs.settings);
    await tapByLabel('Workplace');
    await tapByLabel(`Delete ${workplaceName}`);
    await replaceById('confirmation-value-input', workplaceName);
    await element(by.id('confirmation-value-input')).tapReturnKey();
    await tapById('confirmation-primary-action');

    await assertVisibleById('onboarding-screen', 120000);
  });
});
