import { expect, test } from '@playwright/test';
import { E2E_AUTH_TOKEN } from '../../../src/testing/e2eConstants';

test.use({ viewport: { width: 390, height: 640 } });

for (const mode of ['create', 'edit'] as const) {
  test(`${mode} account type and subtype sheets size to content and scroll`, async ({ page }) => {
    const params = new URLSearchParams({
      e2eAuth: E2E_AUTH_TOKEN,
      e2eReset: '1',
      e2eSeedProfile: 'onboarded',
    });
    await page.goto(`/?${params}`);
    await expect(page.getByTestId('dashboard-screen')).toBeVisible({ timeout: 120000 });

    if (mode === 'edit') {
      await page.goto('/accounts');
      await page.getByText('Cash', { exact: true }).first().click();
      await page.getByTestId('detail-more-actions').click();
      await page.getByTestId('edit-button').click();
    } else {
      await page.goto('/account-creation');
    }

    // A short list must have a usable height, rather than just a sheet header.
    await page.getByTestId('account-type').click();
    await page.getByTestId('account-type-equity').click();
    await expect(page.getByTestId('account-type-close')).toBeHidden();
    await expect(page.getByTestId('account-type')).toContainText('Equity');
    await page.getByTestId('account-subtype').click();
    await page.getByTestId('account-subtype-equity-other').click();
    await expect(page.getByTestId('account-subtype-close')).toBeHidden();
    await expect(page.getByTestId('account-subtype')).toContainText('Other');

    await page.getByTestId('account-type').click();
    await page.getByTestId('account-type-asset').click();
    await expect(page.getByTestId('account-type-close')).toBeHidden();

    // The longer asset list must scroll within the capped sheet to its final row.
    await page.getByTestId('account-subtype').click();
    await page.getByTestId('account-subtype-asset-other').click();
    await expect(page.getByTestId('account-subtype-close')).toBeHidden();
    await expect(page.getByTestId('account-subtype')).toContainText('Other');
    await page.getByTestId('account-subtype').click();
    await page.getByTestId('account-subtype-asset-cash').click();
    await expect(page.getByTestId('account-subtype-close')).toBeHidden();
    await expect(page.getByTestId('account-subtype')).toContainText('Cash');

    if (mode === 'edit') {
      await page.getByTestId('account-type').click();
      await page.getByTestId('account-type-income').click();
      await expect(page.getByTestId('account-type-close')).toBeHidden();
      await expect(page.getByTestId('category-type')).toContainText('Income category');
    }
  });
}
