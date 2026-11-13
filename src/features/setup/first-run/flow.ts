import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import type { OnboardingStep } from './draft';

export type OnboardingFlowEntry = {
  readonly step: OnboardingStep;
  readonly progressName?: string;
};

/**
 * The single source of truth for the onboarding journey. Welcome is intentionally
 * not a progress step; every other entry contributes to the derived progress model.
 */
export const ONBOARDING_FLOW: readonly OnboardingFlowEntry[] = [
  { step: 'welcome' },
  { step: 'currency', progressName: copy.progressCurrency },
  { step: 'now', progressName: copy.progressAccounts },
  { step: 'next', progressName: copy.progressIncome },
  { step: 'protect', progressName: copy.progressPayments },
  { step: 'reserve', progressName: copy.progressSpending },
  { step: 'clarity', progressName: copy.progressResult },
];

export const ONBOARDING_STEPS: readonly OnboardingStep[] = ONBOARDING_FLOW.map(entry => entry.step);

export const ONBOARDING_PROGRESS_FLOW = ONBOARDING_FLOW.filter(
  (entry): entry is OnboardingFlowEntry & { readonly progressName: string } =>
    entry.progressName != null,
);
