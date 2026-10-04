/**
 * @owner mobile
 * @dataSource e2e
 * @platform mobile
 */
import { launchOnboardedApp } from '../../actions/launch';
import { element, by, waitFor } from 'detox';
import { accounts, tabs } from '../../screens';
import { assertTextVisible } from '../../actions/assertions';
import { tapById, tapByLabel, typeById } from '../../actions/mobile/elementActions';
import { LONG_TIMEOUT_MS } from '../../constants/timeouts';
import { createAssetAccount, openAccountsTab } from '../../actions/mobile/flows';

jest.setTimeout(300000);

describe('Accounts', () => {
  beforeAll(async () => {
    await launchOnboardedApp({ seedProfile: 'journal-ready' });
  });

  it('creates a credit card through the name suggestion', async () => {
    const name = 'Detox HDFC card';
    await openAccountsTab();
    await tapById(accounts.fab);
    await typeById('hero-name-input', name);
    await element(by.id('hero-name-input')).tapReturnKey();
    await assertTextVisible('Looks like a credit card.');
    await tapById('account-kind-suggestion-action');
    await assertTextVisible('Amount owed today');
    await assertTextVisible('Add credit card');
    await tapById('account-statement-day');
    await tapById('account-statement-day-grid-15');
    await tapById(accounts.submitFooter, LONG_TIMEOUT_MS);
    await waitFor(element(by.id(tabs.accounts)))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.id(accounts.fab)))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.id(accounts.tabAccounts)))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.id('hero-name-input')))
      .not.toExist()
      .withTimeout(LONG_TIMEOUT_MS);
    try {
      await assertTextVisible(name, 15000);
    } catch {
      await tapByLabel(/Liabilities section/);
      await assertTextVisible(name, LONG_TIMEOUT_MS);
    }
  });

  it('creates a new asset account', async () => {
    await createAssetAccount('Detox Savings');
    await waitFor(element(by.id(tabs.accounts)))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
    await waitFor(element(by.id(accounts.fab)))
      .toBeVisible()
      .withTimeout(LONG_TIMEOUT_MS);
  });
});
