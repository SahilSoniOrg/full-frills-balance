import {
  transitionOnboardingNavigation,
  type OnboardingNavigationContext,
  type OnboardingNavigationState,
} from '../onboardingFlowNavigation';

const fullSetup: OnboardingNavigationContext = { isFullSetup: true, isPostImport: false };
const postImport: OnboardingNavigationContext = { isFullSetup: false, isPostImport: true };

function state(
  stage: OnboardingNavigationState['stage'],
  workplaceStep: OnboardingNavigationState['workplaceStep'] = 'identity',
  returnToReview = false,
): OnboardingNavigationState {
  return { stage, workplaceStep, returnToReview };
}

describe('onboardingFlowNavigation', () => {
  it('advances first-run onboarding through workplace setup, appearance, and review', () => {
    const firstRun = { isFullSetup: false, isPostImport: false };
    let current = state('user_profile');
    let transition = transitionOnboardingNavigation(current, { type: 'continue' }, firstRun);

    expect(transition.command).toBe('claim-device');
    current = transition.state;
    expect(current).toEqual(state('workplace_setup', 'currency'));

    current = transitionOnboardingNavigation(current, { type: 'continue' }, firstRun).state;
    current = transitionOnboardingNavigation(current, { type: 'continue' }, firstRun).state;
    current = transitionOnboardingNavigation(current, { type: 'continue' }, firstRun).state;

    expect(current).toEqual(state('appearance', 'categories'));
    expect(transitionOnboardingNavigation(current, { type: 'continue' }, firstRun).state).toEqual(
      state('review', 'categories'),
    );
  });

  it('skips appearance during standalone workplace creation', () => {
    let current = state('workplace_setup', 'identity');
    current = transitionOnboardingNavigation(current, { type: 'continue' }, fullSetup).state;
    current = transitionOnboardingNavigation(current, { type: 'continue' }, fullSetup).state;
    current = transitionOnboardingNavigation(current, { type: 'continue' }, fullSetup).state;
    current = transitionOnboardingNavigation(current, { type: 'continue' }, fullSetup).state;

    expect(current).toEqual(state('review', 'categories'));
    expect(transitionOnboardingNavigation(current, { type: 'back' }, fullSetup).state).toEqual(
      state('workplace_setup', 'categories'),
    );
  });

  it('returns to review after confirming any edited step', () => {
    const targets = [
      ['profile', state('user_profile', 'categories', true)],
      ['workplace', state('workplace_setup', 'identity', true)],
      ['currency', state('workplace_setup', 'currency', true)],
      ['accounts', state('workplace_setup', 'accounts', true)],
      ['categories', state('workplace_setup', 'categories', true)],
    ] as const;

    for (const [target, editedState] of targets) {
      const entered = transitionOnboardingNavigation(
        state('review', 'categories'),
        { type: 'edit', target },
        fullSetup,
      ).state;
      expect(entered).toEqual(editedState);
      expect(
        transitionOnboardingNavigation(entered, { type: 'continue' }, fullSetup).state,
      ).toEqual(state('review', editedState.workplaceStep));
    }
  });

  it('keeps imported onboarding inside the flow when navigating back from appearance', () => {
    const profile = transitionOnboardingNavigation(
      state('appearance'),
      { type: 'back' },
      postImport,
    );
    expect(profile.state).toEqual(state('user_profile'));
    expect(profile.command).toBeUndefined();

    const appearance = transitionOnboardingNavigation(
      profile.state,
      { type: 'continue' },
      postImport,
    );
    expect(appearance.state).toEqual(state('appearance'));
    expect(appearance.command).toBeUndefined();
  });

  it('returns a navigation command only when the caller must leave onboarding', () => {
    expect(
      transitionOnboardingNavigation(state('user_profile'), { type: 'back' }, fullSetup).command,
    ).toBe('navigate-back');
    expect(
      transitionOnboardingNavigation(
        state('workplace_setup', 'identity'),
        { type: 'back' },
        fullSetup,
      ).command,
    ).toBe('navigate-back');
  });
});
