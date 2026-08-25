import { expect, test } from './fixtures';

test.describe('Transaction Composer performance probes', () => {
  test.setTimeout(120000);

  test('records cold and warm composer mount timings', async ({
    onboardingPage,
    dashboardPage,
    page,
  }) => {
    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Composer Performance User');

    const coldStart = Date.now();
    await dashboardPage.clickPlusButton();
    const coldMs = Date.now() - coldStart;
    await expect(page.getByTestId('journal-entry-screen')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('button', { name: /Open new entry options/i })).toBeVisible({
      timeout: 30000,
    });

    const warmStart = Date.now();
    await dashboardPage.clickPlusButton();
    const warmMs = Date.now() - warmStart;
    await expect(page.getByTestId('journal-entry-screen')).toBeVisible();

    console.info(`[PERF] composer cold_open_ms=${coldMs} warm_open_ms=${warmMs}`);

    // These are harness guards, not universal device-performance claims.
    expect(coldMs).toBeLessThan(30000);
    expect(warmMs).toBeLessThan(30000);
  });
});
