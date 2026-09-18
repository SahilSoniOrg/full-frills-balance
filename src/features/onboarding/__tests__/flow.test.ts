import { ONBOARDING_STAGES } from '../chrome';
import { ONBOARDING_PROGRESS_FLOW } from '../flow';

describe('onboarding progress model', () => {
  it('derives the visible step label and progress bar values from the flow', () => {
    const current = ONBOARDING_STAGES.now;

    expect(current).toEqual({
      label: `Step 2 of ${ONBOARDING_PROGRESS_FLOW.length} · Now`,
      name: 'Now',
      current: 2,
      total: ONBOARDING_PROGRESS_FLOW.length,
    });
    expect(ONBOARDING_STAGES.clarity?.current).toBe(ONBOARDING_PROGRESS_FLOW.length);
    expect(ONBOARDING_STAGES.clarity?.total).toBe(ONBOARDING_PROGRESS_FLOW.length);
  });
});
