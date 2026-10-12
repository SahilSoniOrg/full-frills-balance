import { expect, test } from '@playwright/test';
import { smokeScenarios, type SmokeDriver } from '../../scenarios/smoke';
import { E2E_AUTH_TOKEN } from '../../../src/testing/e2eConstants';

for (const scenario of smokeScenarios) {
  test(scenario.name, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const driver: SmokeDriver = {
      async launch(profile) {
        const params = new URLSearchParams({
          e2eAuth: E2E_AUTH_TOKEN,
          e2eReset: '1',
          e2eSeedProfile: profile,
        });
        await page.goto(`/?${params}`);
        await expect(
          page.getByTestId(
            profile === 'picker-ready' ? 'workplace-picker-screen' : 'dashboard-screen',
          ),
        ).toBeVisible({ timeout: 120000 });
      },
      visibleId: async id => {
        await expect(page.getByTestId(id)).toBeVisible({ timeout: 120000 });
      },
      visibleText: async text => {
        await expect(page.getByText(text, { exact: true })).toBeVisible();
      },
      tapId: async id => {
        await page.getByTestId(id).click();
      },
      tapText: async text => {
        await page.getByText(text, { exact: true }).click();
      },
    };
    try {
      await scenario.run(driver);
    } finally {
      if (errors.length > 0) {
        console.error('Uncaught browser errors:', errors);
        await testInfo.attach('browser-errors', {
          body: JSON.stringify(errors, null, 2),
          contentType: 'application/json',
        });
      }
    }
    expect(errors, 'Uncaught browser errors').toEqual([]);
  });
}
