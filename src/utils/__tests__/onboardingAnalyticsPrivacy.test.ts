import {
  sanitizeAnalyticsProperties,
  sanitizeGlobalAnalyticsProperties,
} from '../observabilityPrivacy';

const PRIVATE_MARKER = 'PrivateOnboardingValue';

const FLOW = {
  flow_version: '1.2.3',
  intent: 'first_run',
  context: 'unregistered_device',
  resumed: false,
} as const;

describe('onboarding analytics privacy boundary', () => {
  it('allows estimate timing while removing financial input', () => {
    expect(sanitizeAnalyticsProperties('onboarding_first_estimate', {
      ...FLOW, duration_ms: 1200, balance: 500, name: 'Bank',
    })).toEqual({ ...FLOW, duration_ms: 1200 });
  });

  it('accepts the creation lifecycle events with allowlisted categorical metadata', () => {
    expect(
      sanitizeAnalyticsProperties('onboarding_flow_started', { ...FLOW }),
    ).toEqual({ ...FLOW });
    expect(
      sanitizeAnalyticsProperties('onboarding_flow_resumed', {
        ...FLOW,
        resumed: true,
        duration_ms: 1500,
      }),
    ).toEqual({ ...FLOW, resumed: true, duration_ms: 1500 });
    expect(
      sanitizeAnalyticsProperties('onboarding_flow_restarted', {
        ...FLOW,
        duration_ms: 200,
      }),
    ).toEqual({ ...FLOW, duration_ms: 200 });
    expect(
      sanitizeAnalyticsProperties('onboarding_step_viewed', {
        ...FLOW,
        step: 'currency',
        duration_ms: 50,
      }),
    ).toEqual({ ...FLOW, step: 'currency', duration_ms: 50 });
    expect(
      sanitizeAnalyticsProperties('onboarding_step_completed', {
        ...FLOW,
        step: 'accounts',
        action: 'complete',
        duration_ms: 1000,
      }),
    ).toEqual({
      ...FLOW,
      step: 'accounts',
      action: 'complete',
      duration_ms: 1000,
    });
    expect(
      sanitizeAnalyticsProperties('onboarding_step_deferred', {
        ...FLOW,
        step: 'income',
        action: 'defer',
        duration_ms: 300,
      }),
    ).toEqual({
      ...FLOW,
      step: 'income',
      action: 'defer',
      duration_ms: 300,
    });
    expect(
      sanitizeAnalyticsProperties('onboarding_validation_blocked', {
        ...FLOW,
        step: 'payments',
        error_code: 'missing_spendable_account',
      }),
    ).toEqual({
      ...FLOW,
      step: 'payments',
      error_code: 'missing_spendable_account',
    });
    expect(
      sanitizeAnalyticsProperties('onboarding_result_viewed', {
        ...FLOW,
        outcome: 'ready',
        duration_ms: 10,
      }),
    ).toEqual({ ...FLOW, outcome: 'ready', duration_ms: 10 });
    expect(
      sanitizeAnalyticsProperties('onboarding_save_result', {
        ...FLOW,
        outcome: 'success',
        duration_ms: 2500,
      }),
    ).toEqual({ ...FLOW, outcome: 'success', duration_ms: 2500 });
    expect(
      sanitizeAnalyticsProperties('onboarding_dashboard_opened', {
        ...FLOW,
        outcome: 'opened',
        duration_ms: 100,
      }),
    ).toEqual({ ...FLOW, outcome: 'opened', duration_ms: 100 });
  });

  it('preserves the legacy onboarding completion event', () => {
    expect(
      sanitizeAnalyticsProperties('onboarding_complete', {
        private_note: PRIVATE_MARKER,
        amount: 500,
      }),
    ).toEqual({});
  });

  it('rejects undeclared onboarding event names', () => {
    expect(
      sanitizeAnalyticsProperties('onboarding_step_skipped', { ...FLOW, step: 'currency' }),
    ).toBeNull();
    expect(sanitizeAnalyticsProperties('onboarding_complete_extra', { ...FLOW })).toBeNull();
  });

  it('drops sensitive and unknown properties from onboarding events', () => {
    expect(
      sanitizeAnalyticsProperties('onboarding_save_result', {
        ...FLOW,
        outcome: 'success',
        amount: 42,
        balance: 7,
        name: PRIVATE_MARKER,
        merchant: PRIVATE_MARKER,
        category: PRIVATE_MARKER,
        account_label: PRIVATE_MARKER,
        error: PRIVATE_MARKER,
        filename: `${PRIVATE_MARKER}.csv`,
        draft: { accounts: [] },
        workplace_id: '123e4567-e89b-12d3-a456-426614174000',
        raw_payload: PRIVATE_MARKER,
      }),
    ).toEqual({ ...FLOW, outcome: 'success' });
  });

  it('drops invalid enumerated token values', () => {
    expect(
      sanitizeAnalyticsProperties('onboarding_step_viewed', {
        ...FLOW,
        step: PRIVATE_MARKER,
        action: PRIVATE_MARKER,
      }),
    ).toEqual({ ...FLOW });
    expect(
      sanitizeAnalyticsProperties('onboarding_validation_blocked', {
        ...FLOW,
        step: 'currency',
        error_code: PRIVATE_MARKER,
      }),
    ).toEqual({ ...FLOW, step: 'currency' });
  });

  it('rejects non-finite and negative durations', () => {
    expect(
      sanitizeAnalyticsProperties('onboarding_step_viewed', {
        ...FLOW,
        step: 'currency',
        duration_ms: -1,
      }),
    ).toEqual({ ...FLOW, step: 'currency' });
    expect(
      sanitizeAnalyticsProperties('onboarding_step_viewed', {
        ...FLOW,
        step: 'currency',
        duration_ms: Number.NaN,
      }),
    ).toEqual({ ...FLOW, step: 'currency' });
  });

  it('does not leak private markers through global analytics properties', () => {
    expect(
      sanitizeGlobalAnalyticsProperties({
        $active_workplace_id: '123e4567-e89b-12d3-a456-426614174000',
        active_currency: 'USD',
      }),
    ).toEqual({
      $active_workplace_id: '123e4567-e89b-12d3-a456-426614174000',
      active_currency: 'USD',
    });
  });
});