import { device, element, by, waitFor, expect } from 'detox';
import { execFileSync } from 'node:child_process';
import { E2E_AUTH_TOKEN } from '../../../src/testing/e2eConstants';

const openJournal = async (state: string) => {
  await device.openURL({
    url: `fullfrillsbalance://journal-details?journalId=qa-journal-${state}`,
  });
  await waitFor(element(by.id(`journal-summary-qa-journal-${state}`)))
    .toBeVisible()
    .withTimeout(30000);
  await expect(element(by.id('edit-button'))).toExist();
  // Synchronization is disabled for the Expo client; allow the native push transition to finish.
  await new Promise(resolve => setTimeout(resolve, 500));
};

describe('journal details redesign', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: {
        e2eAuth: E2E_AUTH_TOKEN,
        e2eReset: '1',
        e2eSeedProfile: 'journal-details-redesign',
      },
      ...(process.env.JOURNAL_QA_METRO_URL ? { url: process.env.JOURNAL_QA_METRO_URL } : {}),
    });
    await device.disableSynchronization();
    await waitFor(element(by.id('dashboard-screen')))
      .toExist()
      .withTimeout(120000);
    await waitFor(element(by.text('Later')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.text('Later')).tap();
  });

  it('captures the five reference states in light and dark', async () => {
    for (const appearance of ['light', 'dark'] as const) {
      execFileSync('xcrun', ['simctl', 'ui', device.id, 'appearance', appearance]);
      await openJournal('simple');
      await expect(element(by.id('journal-after-balances'))).toExist();
      await expect(element(by.id('journal-accounting-issues'))).not.toExist();
      await device.takeScreenshot(`journal-simple-${appearance}`);
      await element(by.id('journal-details-scroll')).scrollTo('bottom');
      await expect(element(by.id('journal-revert-change'))).toExist();
      await device.takeScreenshot(`journal-history-${appearance}`);
      await element(by.id('journal-source-row')).tap();
      await waitFor(element(by.text('Open in SMS inbox')))
        .toExist()
        .withTimeout(10000);
      await new Promise(resolve => setTimeout(resolve, 500));
      await device.takeScreenshot(`journal-sms-sheet-${appearance}`);
      await element(by.label('Close message')).atIndex(1).tap();
      await waitFor(element(by.text('Open in SMS inbox')))
        .not.toBeVisible()
        .withTimeout(5000);
      await openJournal('planned');
      await expect(element(by.id('journal-after-balances'))).not.toExist();
      await expect(element(by.id('journal-post'))).toExist();
      await expect(element(by.id('journal-skip'))).toExist();
      await expect(element(by.id('journal-schedule'))).toExist();
      await device.takeScreenshot(`journal-planned-${appearance}`);
      await openJournal('fx');
      await expect(element(by.id('journal-split'))).toExist();
      await expect(element(by.id('journal-accounting-issues'))).not.toExist();
      await device.takeScreenshot(`journal-fx-${appearance}`);
    }
  });

  it('checks lifecycle and valuation states, and keeps Edit reachable', async () => {
    for (const state of [
      'income',
      'transfer',
      'overdue',
      'orphaned',
      'scheduled-posted',
      'skipped',
      'imported',
      'missing-fx',
      'unbalanced',
    ]) {
      await openJournal(state);
      if (state === 'missing-fx' || state === 'unbalanced') {
        await expect(element(by.id('journal-accounting-issues'))).toExist();
      }
      if (state === 'orphaned') await expect(element(by.id('journal-skip'))).not.toExist();
      await device.takeScreenshot(`journal-${state}`);
    }
    await openJournal('simple');
    await element(by.id('edit-button')).tap();
    await waitFor(element(by.id('hero-amount-input')))
      .toExist()
      .withTimeout(15000);
  });

  it('captures long content at an accessibility text size', async () => {
    execFileSync('xcrun', ['simctl', 'ui', device.id, 'appearance', 'light']);
    execFileSync('xcrun', ['simctl', 'ui', device.id, 'content_size', 'accessibility-large']);
    try {
      await openJournal('long');
      await device.takeScreenshot('journal-large-text');
    } finally {
      execFileSync('xcrun', ['simctl', 'ui', device.id, 'content_size', 'large']);
    }
  });

  it('copies the full journal ID and undoes the newest supported edit', async () => {
    await openJournal('simple');
    await element(by.id('journal-details-scroll')).scrollTo('bottom');
    await element(by.id('journal-record-copy')).longPress();
    await waitFor(element(by.text('Journal ID copied')))
      .toBeVisible()
      .withTimeout(10000);
    const copied = execFileSync('xcrun', ['simctl', 'pbpaste', device.id], { encoding: 'utf8' });
    if (copied.trim() !== 'qa-journal-simple')
      throw new Error('The full journal ID was not copied');
    await element(by.id('journal-revert-change')).tap();
    await waitFor(element(by.text('Revert this change?')))
      .toBeVisible()
      .withTimeout(10000);
    await new Promise(resolve => setTimeout(resolve, 500));
    await element(by.id('confirmation-primary-action')).tap();
    await waitFor(element(by.text('Change undone successfully')))
      .toBeVisible()
      .withTimeout(10000);
    // The undone rename and its revert leave the card; the rename before it becomes undoable.
    await expect(element(by.text('Change reverted'))).not.toExist();
    await expect(element(by.id('journal-revert-change'))).toExist();
  });
});
