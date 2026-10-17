/** @owner mobile @dataSource disposable-demo @platform ios,android */
import { device, element, by, waitFor, expect } from 'detox';
import { expect as jestExpect } from '@jest/globals';
import { launchFreshApp, launchOnboardedApp, relaunchPreservingData } from '../../actions/launch';
import { tapById } from '../../actions/mobile/elementActions';
import { tabs } from '../../screens';

jest.setTimeout(240000);

describe('Encrypted backup entry points', () => {
  it('opens recovery on a fresh installation behind the privacy acknowledgement', async () => {
    await launchFreshApp({ disableSynchronization: true });
    await tapById('onboarding-encrypted-restore-button', 120000);
    await tapById('privacy-acknowledgement-continue-button', 30000);
    await waitFor(element(by.id('encrypted-backup-pick-zip')))
      .toBeVisible()
      .withTimeout(30000);
    if (device.getPlatform() === 'ios') {
      // RN marks disabled iOS touchables with an accessibility trait;
      // UIView.userInteractionEnabled alone does not reflect that state.
      await expect(
        element(by.id('encrypted-backup-restore').and(by.traits(['notEnabled']))),
      ).toExist();
    } else {
      const confirm = await element(by.id('encrypted-backup-restore')).getAttributes();
      jestExpect('enabled' in confirm && confirm.enabled).toBe(false);
    }
    await expect(element(by.id('encrypted-backup-begin-user'))).not.toExist();
  });

  it('starts explicit User setup from Settings without exporting a secret automatically', async () => {
    await launchOnboardedApp({ seedProfile: 'onboarded', disableSynchronization: true });
    await tapById(tabs.settings);
    await tapById('settings-data-management');
    await tapById('settings-encrypted-backup');
    await waitFor(element(by.id('encrypted-backup-begin-user')))
      .toBeVisible()
      .withTimeout(30000);
    await tapById('encrypted-backup-begin-user');
    await waitFor(element(by.id('encrypted-backup-export-secret')))
      .toBeVisible()
      .withTimeout(30000);
    await expect(element(by.id('encrypted-backup-verify-secret'))).toBeVisible();
    await device.terminateApp();
    // A restart drops the in-memory secret. The unfinished root must be resumed,
    // or explicitly discarded, never silently generated again.
    await relaunchPreservingData();
    await tapById(tabs.settings);
    await tapById('settings-data-management');
    await tapById('settings-encrypted-backup');
    await waitFor(element(by.id('encrypted-backup-verify-secret')))
      .toBeVisible()
      .withTimeout(30000);
    const verifyAttributes = await element(by.id('encrypted-backup-verify-secret')).getAttributes();
    const discardAttributes = await element(by.id('encrypted-backup-discard')).getAttributes();
    jestExpect('enabled' in verifyAttributes && verifyAttributes.enabled).toBe(true);
    jestExpect('enabled' in discardAttributes && discardAttributes.enabled).toBe(true);
    await expect(element(by.id('encrypted-backup-export-secret'))).not.toExist();
    await expect(element(by.id('encrypted-backup-begin-user'))).not.toExist();

    await element(by.id('encrypted-backup-discard')).tap();
    await waitFor(element(by.id('confirmation-close-button')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('confirmation-close-button')).tap();
    await waitFor(element(by.id('confirmation-close-button')))
      .not.toExist()
      .withTimeout(5000);
  });
});
