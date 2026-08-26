import { expect, test } from './fixtures';

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

test.describe('Dashboard performance probes', () => {
  test.setTimeout(120000);

  test('records first-open and warm dashboard navigation medians', async ({
    onboardingPage,
    dashboardPage,
    page,
  }) => {
    const warmSamples: number[] = [];

    await onboardingPage.clearAppState();
    await onboardingPage.goto('/');
    await onboardingPage.completeOnboarding('Dashboard Performance User');

    const coldStart = Date.now();
    await dashboardPage.switchToDashboard();
    await expect(page.getByTestId('dashboard-screen')).toBeVisible();
    await expect(page.getByLabel('Open safe-to-spend calculation info')).toBeVisible();
    const coldMs = Date.now() - coldStart;

    for (let sample = 0; sample < 7; sample += 1) {
      await dashboardPage.switchToActivity();

      const warmStart = Date.now();
      await dashboardPage.switchToDashboard();
      await expect(page.getByTestId('dashboard-screen')).toBeVisible();
      await expect(page.getByLabel('Open safe-to-spend calculation info')).toBeVisible();
      warmSamples.push(Date.now() - warmStart);
    }

    const warmMedian = median(warmSamples);
    console.info(`[PERF] dashboard first_open_ms=${coldMs} warm_median_ms=${warmMedian}`);

    // Local browser budgets, calibrated from repeated fresh-onboarding runs.
    // The warm path uses a median to avoid a single animation or GC spike.
    expect(coldMs).toBeLessThan(225);
    expect(warmMedian).toBeLessThan(125);
  });
});
