import type { OnboardingStage, OnboardingWorkplaceStep } from './onboardingTypes';

export type OnboardingEditTarget =
  'profile' | 'workplace' | 'currency' | 'accounts' | 'categories' | 'appearance';

export interface OnboardingNavigationState {
  stage: OnboardingStage;
  workplaceStep: OnboardingWorkplaceStep;
  returnToReview: boolean;
}

export type OnboardingNavigationEvent =
  { type: 'continue' } | { type: 'back' } | { type: 'edit'; target: OnboardingEditTarget };

export type OnboardingNavigationCommand = 'claim-device' | 'navigate-back';

export interface OnboardingNavigationContext {
  isFullSetup: boolean;
  isPostImport: boolean;
}

export interface OnboardingNavigationTransition {
  state: OnboardingNavigationState;
  command?: OnboardingNavigationCommand;
}

const previousWorkplaceStep: Record<OnboardingWorkplaceStep, OnboardingWorkplaceStep> = {
  identity: 'identity',
  currency: 'identity',
  accounts: 'currency',
  categories: 'accounts',
};

function nextWorkplaceStep(step: OnboardingWorkplaceStep): OnboardingWorkplaceStep | undefined {
  if (step === 'identity') return 'currency';
  if (step === 'currency') return 'accounts';
  if (step === 'accounts') return 'categories';
  return undefined;
}

function transitionContinue(
  state: OnboardingNavigationState,
  context: OnboardingNavigationContext,
): OnboardingNavigationTransition {
  if (state.stage === 'user_profile') {
    if (state.returnToReview) {
      return {
        state: { ...state, stage: 'review', returnToReview: false },
        ...(context.isPostImport ? {} : { command: 'claim-device' as const }),
      };
    }
    if (context.isPostImport) {
      return { state: { ...state, stage: 'appearance' } };
    }
    return {
      state: {
        ...state,
        stage: 'workplace_setup',
        workplaceStep: 'currency',
      },
      command: 'claim-device',
    };
  }

  if (state.stage === 'workplace_setup') {
    if (state.returnToReview) {
      return { state: { ...state, stage: 'review', returnToReview: false } };
    }
    const nextStep = nextWorkplaceStep(state.workplaceStep);
    return nextStep
      ? { state: { ...state, workplaceStep: nextStep } }
      : {
          state: {
            ...state,
            stage: context.isFullSetup ? 'review' : 'appearance',
          },
        };
  }

  if (state.stage === 'appearance') {
    return {
      state: { ...state, stage: 'review', returnToReview: false },
    };
  }

  return { state };
}

function transitionBack(
  state: OnboardingNavigationState,
  context: OnboardingNavigationContext,
): OnboardingNavigationTransition {
  if (state.returnToReview && state.stage !== 'review') {
    return { state: { ...state, stage: 'review', returnToReview: false } };
  }
  if (state.stage === 'user_profile') {
    return { state, command: 'navigate-back' };
  }
  if (state.stage === 'workplace_setup') {
    if (state.workplaceStep === 'identity') {
      return context.isFullSetup
        ? { state, command: 'navigate-back' }
        : { state: { ...state, stage: 'user_profile' } };
    }
    return { state: { ...state, workplaceStep: previousWorkplaceStep[state.workplaceStep] } };
  }
  if (state.stage === 'appearance') {
    return context.isPostImport
      ? { state: { ...state, stage: 'user_profile' } }
      : { state: { ...state, stage: 'workplace_setup', workplaceStep: 'categories' } };
  }
  if (state.stage === 'review') {
    return {
      state: {
        ...state,
        stage: context.isFullSetup ? 'workplace_setup' : 'appearance',
        workplaceStep: context.isFullSetup ? 'categories' : state.workplaceStep,
      },
    };
  }
  return { state };
}

function transitionEdit(
  state: OnboardingNavigationState,
  target: OnboardingEditTarget,
): OnboardingNavigationTransition {
  if (target === 'profile') {
    return { state: { ...state, stage: 'user_profile', returnToReview: true } };
  }
  if (target === 'appearance') {
    return { state: { ...state, stage: 'appearance', returnToReview: true } };
  }
  return {
    state: {
      ...state,
      stage: 'workplace_setup',
      workplaceStep: target === 'workplace' ? 'identity' : target,
      returnToReview: true,
    },
  };
}

/** Pure navigation module for onboarding. Side effects are returned as commands. */
export function transitionOnboardingNavigation(
  state: OnboardingNavigationState,
  event: OnboardingNavigationEvent,
  context: OnboardingNavigationContext,
): OnboardingNavigationTransition {
  if (event.type === 'continue') return transitionContinue(state, context);
  if (event.type === 'back') return transitionBack(state, context);
  return transitionEdit(state, event.target);
}
