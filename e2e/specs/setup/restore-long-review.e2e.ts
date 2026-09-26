/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { by, device, element, expect, waitFor } from 'detox';
import { E2E_AUTH_TOKEN } from '../../utils/launchArgs';

jest.setTimeout(240000);

const invalidJournalId = (index: number) =>
  index === 0
    ? 'restore-invalid-same-currency-journal'
    : `restore-invalid-same-currency-journal-${index}`;

it('preserves review scroll and keeps the restore action reachable for a long report', async () => {
  await device.launchApp({
    newInstance: true,
    delete: true,
    permissions: { notifications: 'YES' },
    launchArgs: {
      e2eAuth: E2E_AUTH_TOKEN,
      e2eReset: '1',
      e2eSeedProfile: 'bulk-restore-long-review',
    },
  });
  await device.disableSynchronization();

  await waitFor(element(by.id('restore-summary-continue')))
    .toExist()
    .withTimeout(60000);
  await element(by.id('restore-summary-continue')).tap();

  await waitFor(element(by.id('restore-apply-safe-fx-suggestions')))
    .toExist()
    .withTimeout(60000);
  await element(by.id('restore-apply-safe-fx-suggestions')).tap();
  await waitFor(element(by.text('20 journal entries need attention')))
    .toExist()
    .withTimeout(60000);

  const recoveryScroll = element(by.id('restore-journal-recovery-scroll'));
  await recoveryScroll.scrollTo('bottom');
  const lastIgnore = element(by.id(`restore-journal-ignore-${invalidJournalId(19)}`));
  await expect(lastIgnore).toBeVisible();
  await lastIgnore.tap();

  await waitFor(element(by.text('19 journal entries need attention')))
    .toExist()
    .withTimeout(60000);
  await expect(element(by.id(`restore-journal-review-${invalidJournalId(18)}`))).toBeVisible();
  await device.takeScreenshot('restore-long-review-scroll-retained');

  for (let index = 18; index >= 0; index -= 1) {
    await element(by.id(`restore-journal-ignore-${invalidJournalId(index)}`)).tap();
    if (index > 0) {
      await waitFor(element(by.id(`restore-journal-ignore-${invalidJournalId(index - 1)}`)))
        .toBeVisible()
        .withTimeout(60000);
    }
  }

  await waitFor(element(by.id('onboarding-theme-continue-button')))
    .toExist()
    .withTimeout(60000);
  await element(by.id('onboarding-theme-continue-button')).tap();
  await waitFor(element(by.id('onboarding-summary-step')))
    .toExist()
    .withTimeout(60000);
  await element(by.id('onboarding-finish-button')).tap();

  await waitFor(element(by.text('Restore changes applied')))
    .toExist()
    .withTimeout(60000);
  await expect(element(by.id('restore-changes-scroll'))).toBeVisible();
  await expect(element(by.id('restore-fx-repair-change-0'))).toExist();
  await expect(
    element(
      by.text(
        'We applied 21 changes while restoring 2 workplaces. Review the list, then continue.',
      ),
    ),
  ).toExist();
  await expect(element(by.text('Continue to restored data'))).toBeVisible();
  await device.takeScreenshot('restore-long-change-report');
});
