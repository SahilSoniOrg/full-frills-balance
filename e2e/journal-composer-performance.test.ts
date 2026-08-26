import { expect, test } from './fixtures';

test.describe('Transaction Composer performance probes', () => {
  test.setTimeout(120000);

  test('records cold and warm composer mount timings', async ({
    onboardingPage,
    dashboardPage,
    page,
  }) => {
    const coldSamples: number[] = [];
    const warmSamples: number[] = [];

    for (let sample = 0; sample < 7; sample += 1) {
      await onboardingPage.clearAppState();
      await onboardingPage.goto('/');
      await onboardingPage.completeOnboarding(`Composer Performance User ${sample}`);

      const coldStart = Date.now();
      await dashboardPage.clickPlusButton();
      await expect(page.getByTestId('journal-entry-screen')).toBeVisible();
      coldSamples.push(Date.now() - coldStart);

      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('button', { name: /Open new entry options/i })).toBeVisible();

      const warmStart = Date.now();
      await dashboardPage.clickPlusButton();
      await expect(page.getByTestId('journal-entry-screen')).toBeVisible();
      warmSamples.push(Date.now() - warmStart);
    }

    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const coldMedian = median(coldSamples);
    const warmMedian = median(warmSamples);

    console.info(`[PERF] composer cold_median_ms=${coldMedian} warm_median_ms=${warmMedian}`);

    // Budgets are local regression guards, calibrated against a seven-sample
    // browser baseline. Median measurements avoid failing on a single GC spike.
    expect(coldMedian).toBeLessThan(225);
    expect(warmMedian).toBeLessThan(65);
  });
});
