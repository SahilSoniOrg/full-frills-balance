/** @owner mobile @dataSource disposable-demo @platform ios,android */
import { device, element, by, waitFor, expect } from 'detox';
import { expect as jestExpect } from '@jest/globals';
import { launchFreshApp, launchOnboardedApp, relaunchPreservingData } from '../../actions/launch';
import { tapById, tapByText } from '../../actions/mobile/elementActions';
import { tabs } from '../../screens';

jest.setTimeout(240000);

describe('Private recovery entry points', () => {
  it('opens recovery on a fresh installation behind the privacy acknowledgement', async () => {
    await launchFreshApp({ disableSynchronization: true });
    await tapById('onboarding-user-recovery-button', 120000);
    await tapById('privacy-acknowledgement-continue-button', 30000);
    await waitFor(element(by.id('recovery-choose-secret')))
      .toBeVisible()
      .withTimeout(30000);
    if (device.getPlatform() === 'ios') {
      // RN marks disabled iOS touchables with an accessibility trait;
      // UIView.userInteractionEnabled alone does not reflect that state.
      await expect(element(by.id('recovery-confirm').and(by.traits(['notEnabled'])))).toExist();
    } else {
      const confirm = await element(by.id('recovery-confirm')).getAttributes();
      jestExpect('enabled' in confirm && confirm.enabled).toBe(false);
    }
    await expect(element(by.id('encryption-begin-user'))).not.toExist();
  });

  it('starts explicit User setup from Settings without exporting a secret automatically', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded', disableSynchronization: true });
    await tapById(tabs.settings);
    await tapById('settings-data-management');
    await tapByText('Private backup & recovery');
    await waitFor(element(by.id('encryption-begin-user')))
      .toBeVisible()
      .withTimeout(30000);
    await tapById('encryption-begin-user');
    await waitFor(element(by.id('encryption-export-secret')))
      .toBeVisible()
      .withTimeout(30000);
    await expect(element(by.id('encryption-verify-secret'))).toBeVisible();
    await device.terminateApp();
    // A restart drops the in-memory secret. The unfinished root must be resumed,
    // or explicitly discarded, never silently generated again.
    await relaunchPreservingData();
    await tapById(tabs.settings);
    await tapById('settings-data-management');
    await tapByText('Private backup & recovery');
    await waitFor(element(by.id('encryption-verify-secret')))
      .toBeVisible()
      .withTimeout(30000);
    await expect(element(by.id('encryption-export-secret'))).not.toExist();
    await expect(element(by.id('encryption-begin-user'))).not.toExist();
  });
});
