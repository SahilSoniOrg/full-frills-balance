import { analytics } from '@/src/services/analytics';

/**
 * Privacy-safe creation (onboarding) lifecycle analytics.
 *
 * This is a small typed façade over the existing analytics service. It does not
 * introduce a generic analytics framework: each event has its own function and
 * fixed property set, and every value is validated by
 * `src/utils/observabilityPrivacy.ts` before delivery.
 *
 * Parent emission rules (callers must follow these to keep metrics honest):
 * - `onboarding_flow_started` is emitted once per flow instance, on first mount
 *   of the creation surface. Remounting the same instance must not re-emit it.
 * - `onboarding_flow_resumed` is emitted only when a previously started,
 *   unfinished flow instance is resumed. Its `duration_ms` measures the resumed
 *   segment only; it is never added to a fresh flow's duration.
 * - `onboarding_flow_restarted` is emitted only on an explicit "Start over"
 *   action that discards the unfinished session. It is not emitted on Back.
 * - `onboarding_step_viewed` is emitted when a step becomes the active step.
 *   Back/Forward navigation may emit it for the destination step, but a remount
 *   of an already-viewed step must not inflate view counts.
 * - `onboarding_step_completed` and `onboarding_step_deferred` are emitted only
 *   on an explicit user action (Continue / "I'll add this later"), never on
 *   remount, Back, or automatic checkpoint completion.
 * - `onboarding_validation_blocked` is emitted when an attempted Continue is
 *   rejected for invalid included input. Throttle to once per step + error code.
 * - `onboarding_result_viewed` is emitted once per flow instance when the
 *   result step becomes visible.
 * - `onboarding_save_result` is emitted once per save attempt, with the final
 *   outcome and, on failure, a bounded error code.
 * - `onboarding_dashboard_opened` is emitted once when the saved workplace is
 *   successfully opened in the dashboard.
 * - The legacy `onboarding_complete` event remains the terminal conversion
 *   marker and is emitted only when the device was not registered before
 *   commit. Do not emit it on remount or Back, and do not replace it with a
 *   persistent completion flag.
 */

export type OnboardingIntent = 'first_run' | 'add_workplace';

export type OnboardingContext =
  | 'unregistered_device'
  | 'registered_empty_device'
  | 'workplace_picker'
  | 'existing_workplace_entry';

export type OnboardingStepId =
  | 'welcome'
  | 'currency'
  | 'accounts'
  | 'income'
  | 'payments'
  | 'monthly_limits'
  | 'result';

export type OnboardingAction =
  | 'start'
  | 'resume'
  | 'restart'
  | 'view'
  | 'complete'
  | 'defer'
  | 'skip'
  | 'continue'
  | 'back'
  | 'retry'
  | 'save'
  | 'open'
  | 'cancel';

export type OnboardingErrorCode =
  | 'amount_invalid'
  | 'missing_spendable_account'
  | 'income_invalid'
  | 'payment_invalid'
  | 'budget_invalid'
  | 'dependency_unresolved'
  | 'required_field_missing'
  | 'save_failed'
  | 'open_failed'
  | 'unknown';

export type OnboardingOutcome =
  | 'success'
  | 'failure'
  | 'retry'
  | 'cancelled'
  | 'skipped'
  | 'viewed'
  | 'ready'
  | 'zero'
  | 'positive'
  | 'negative'
  | 'unknown'
  | 'saved'
  | 'opened';

export interface OnboardingFlowAnalytics {
  readonly flowVersion: string;
  readonly intent: OnboardingIntent;
  readonly context: OnboardingContext;
  readonly resumed: boolean;
}

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

function boundedDuration(durationMs?: number): number | undefined {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    return undefined;
  }
  return Math.min(durationMs, MAX_DURATION_MS);
}

function flowProps(input: OnboardingFlowAnalytics): Record<string, unknown> {
  return {
    flow_version: input.flowVersion,
    intent: input.intent,
    context: input.context,
    resumed: input.resumed,
  };
}

export function trackOnboardingFlowStarted(
  input: OnboardingFlowAnalytics,
): boolean {
  return analytics.track('onboarding_flow_started', flowProps(input));
}

export function trackOnboardingFlowResumed(
  input: OnboardingFlowAnalytics & { readonly durationMs?: number },
): boolean {
  return analytics.track('onboarding_flow_resumed', {
    ...flowProps(input),
    duration_ms: boundedDuration(input.durationMs),
  });
}

export function trackOnboardingFlowRestarted(
  input: OnboardingFlowAnalytics & { readonly durationMs?: number },
): boolean {
  return analytics.track('onboarding_flow_restarted', {
    ...flowProps(input),
    duration_ms: boundedDuration(input.durationMs),
  });
}

export function trackOnboardingStepViewed(
  input: OnboardingFlowAnalytics & {
    readonly step: OnboardingStepId;
    readonly durationMs?: number;
  },
): boolean {
  return analytics.track('onboarding_step_viewed', {
    ...flowProps(input),
    step: input.step,
    duration_ms: boundedDuration(input.durationMs),
  });
}

export function trackOnboardingStepCompleted(
  input: OnboardingFlowAnalytics & {
    readonly step: OnboardingStepId;
    readonly action: OnboardingAction;
    readonly durationMs?: number;
  },
): boolean {
  return analytics.track('onboarding_step_completed', {
    ...flowProps(input),
    step: input.step,
    action: input.action,
    duration_ms: boundedDuration(input.durationMs),
  });
}

export function trackOnboardingStepDeferred(
  input: OnboardingFlowAnalytics & {
    readonly step: OnboardingStepId;
    readonly action: OnboardingAction;
    readonly durationMs?: number;
  },
): boolean {
  return analytics.track('onboarding_step_deferred', {
    ...flowProps(input),
    step: input.step,
    action: input.action,
    duration_ms: boundedDuration(input.durationMs),
  });
}

export function trackOnboardingValidationBlocked(
  input: OnboardingFlowAnalytics & {
    readonly step: OnboardingStepId;
    readonly errorCode: OnboardingErrorCode;
  },
): boolean {
  return analytics.track('onboarding_validation_blocked', {
    ...flowProps(input),
    step: input.step,
    error_code: input.errorCode,
  });
}

export function trackOnboardingResultViewed(
  input: OnboardingFlowAnalytics & {
    readonly outcome: OnboardingOutcome;
    readonly durationMs?: number;
  },
): boolean {
  return analytics.track('onboarding_result_viewed', {
    ...flowProps(input),
    outcome: input.outcome,
    duration_ms: boundedDuration(input.durationMs),
  });
}

export function trackOnboardingSaveResult(
  input: OnboardingFlowAnalytics & {
    readonly outcome: OnboardingOutcome;
    readonly errorCode?: OnboardingErrorCode;
    readonly durationMs?: number;
  },
): boolean {
  return analytics.track('onboarding_save_result', {
    ...flowProps(input),
    outcome: input.outcome,
    error_code: input.errorCode,
    duration_ms: boundedDuration(input.durationMs),
  });
}

export function trackOnboardingDashboardOpened(
  input: OnboardingFlowAnalytics & {
    readonly outcome: OnboardingOutcome;
    readonly durationMs?: number;
  },
): boolean {
  return analytics.track('onboarding_dashboard_opened', {
    ...flowProps(input),
    outcome: input.outcome,
    duration_ms: boundedDuration(input.durationMs),
  });
}