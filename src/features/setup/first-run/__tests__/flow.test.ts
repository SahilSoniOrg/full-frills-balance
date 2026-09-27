import { onboardingStage } from '../chrome';
import { ONBOARDING_PROGRESS_FLOW } from '../flow';

describe('onboarding progress model', () => {
  it('derives the visible step label and progress bar values from the flow', () => {
    expect(onboardingStage('now')).toEqual({
      label: `Step 2 of ${ONBOARDING_PROGRESS_FLOW.length} · Now`,
      current: 2,
      total: ONBOARDING_PROGRESS_FLOW.length,
    });
    expect(onboardingStage('clarity')?.current).toBe(ONBOARDING_PROGRESS_FLOW.length);
    expect(onboardingStage('clarity')?.total).toBe(ONBOARDING_PROGRESS_FLOW.length);
  });

  it('does not show progress on the welcome step', () => {
    expect(onboardingStage('welcome')).toBeNull();
  });
});
