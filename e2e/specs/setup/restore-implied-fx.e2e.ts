import { by, device, element, expect, waitFor } from 'detox';
import { launchSeedProfileApp } from '../../actions/launch';
import { scrollToId } from '../../actions/mobile/elementActions';

jest.setTimeout(180000);

it('offers a uniquely implied FX rate and keeps imported account amounts during restore', async () => {
  await launchSeedProfileApp('first-run-restore-fx-recovery', { disableSynchronization: true });

  await waitFor(element(by.id('restore-summary-continue')))
    .toExist()
    .withTimeout(60000);
  await expect(element(by.text('Restore is ready'))).toExist();
  await element(by.id('restore-summary-continue')).tap();

  await waitFor(element(by.id('restore-apply-safe-fx-suggestions')))
    .toExist()
    .withTimeout(60000);
  await expect(element(by.text('2 journal entries need attention'))).toExist();
  await expect(element(by.text('A calculated rate can balance 1 entry'))).toExist();
  await expect(
    element(
      by.text(
        'Every posting line uses INR. Check the amounts; an FX adjustment cannot resolve this same-currency imbalance.',
      ),
    ),
  ).toExist();
  await expect(element(by.id('restore-implied-fx-rate-restore-fx-hkd-line'))).toExist();
  await expect(element(by.text('Debit 5791.12 · Credit 5791.12 INR'))).toExist();
  await device.takeScreenshot('restore-implied-fx-preview');

  const reviewRate = element(by.label('Review or edit this rate'));
  await waitFor(reviewRate)
    .toBeVisible()
    .whileElement(by.id('restore-journal-recovery-scroll'))
    .scroll(250, 'down');
  await reviewRate.tap();
  await waitFor(element(by.text('Review journal entry')))
    .toExist()
    .withTimeout(30000);
  await scrollToId('restore-journal-edit');
  await element(by.id('restore-journal-edit')).tap();
  await expect(
    element(by.id('restore-journal-fx-restore-fx-hkd-line-converted-amount-input')),
  ).toExist();
  await expect(element(by.id('restore-journal-amount-restore-fx-hkd-line'))).toExist();
  await device.takeScreenshot('restore-implied-fx-editable-rate');
  await element(by.id('restore-journal-recovery-scroll')).scrollTo('bottom');
  await element(by.text('Cancel editing')).tap();
  await element(by.id('restore-journal-recovery-scroll')).scrollTo('top');
  await element(by.text('Back to all entries')).tap();

  await element(by.id('restore-apply-safe-fx-suggestions')).tap();
  await waitFor(element(by.id('restore-journal-ignore-restore-invalid-same-currency-journal')))
    .toExist()
    .withTimeout(60000);
  await expect(
    element(
      by.text(
        'Every posting line uses INR. Check the amounts; an FX adjustment cannot resolve this same-currency imbalance.',
      ),
    ),
  ).toExist();
  await device.takeScreenshot('restore-same-currency-journal-flagged');
  await element(by.id('restore-journal-ignore-restore-invalid-same-currency-journal')).tap();

  await waitFor(element(by.id('onboarding-summary-step')))
    .toExist()
    .withTimeout(60000);
  await element(by.id('onboarding-finish-button')).tap();
  await waitFor(element(by.text('Restore changes applied')))
    .toExist()
    .withTimeout(60000);
  await expect(element(by.id('restore-fx-repair-change-0'))).toExist();
  await device.takeScreenshot('restore-implied-fx-applied');

  await element(by.text('Continue to restored data')).tap();
  await waitFor(element(by.id('dashboard-screen')))
    .toExist()
    .withTimeout(60000);
  await waitFor(element(by.id('journal-entry-card-title')))
    .toExist()
    .withTimeout(60000);
  await element(by.id('journal-entry-card-title')).tap();
  await waitFor(element(by.text('Breakdown')))
    .toExist()
    .withTimeout(60000);
  await expect(element(by.text('HKD Cash'))).toExist();
  await expect(element(by.text('Federal Fi'))).toExist();
  await expect(element(by.text('+HK$500.76'))).toExist();
  await expect(element(by.text('-₹5,791.12'))).toExist();
  await device.takeScreenshot('restore-implied-fx-journal-details');
});
