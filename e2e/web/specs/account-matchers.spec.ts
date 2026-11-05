import { expect, test } from '@playwright/test';
import { E2E_AUTH_TOKEN } from '../../../src/testing/e2eConstants';

test('Account Edit opens SMS recognition management and saves a matcher', async ({ page }) => {
  const params = new URLSearchParams({
    e2eAuth: E2E_AUTH_TOKEN,
    e2eReset: '1',
    e2eSeedProfile: 'onboarded',
  });
  await page.goto(`/?${params}`);
  await expect(page.getByTestId('dashboard-screen')).toBeVisible({ timeout: 120000 });

  await page.goto('/accounts');
  await page.getByText('Cash', { exact: true }).first().click();
  await page.getByTestId('detail-more-actions').click();
  await page.getByTestId('edit-button').click();

  await page.getByTestId('account-sms-recognition').click();
  await expect(page.getByTestId('account-matchers-section')).toBeVisible();
  await page.getByTestId('add-account-matcher').click();
  await page.getByTestId('account-matcher-sender').fill('HDFCBK');
  await page.getByTestId('account-matcher-advanced-toggle').click();
  await page.getByTestId('account-matcher-fragments').fill('debited\nAvbl bal');
  await page.getByTestId('submit-footer-button').click();

  await expect(page.getByTestId('account-matchers-section')).toContainText('HDFCBK');
});
