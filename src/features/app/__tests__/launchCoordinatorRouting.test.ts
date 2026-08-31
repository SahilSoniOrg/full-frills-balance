import { shouldRenderGateChildren } from '../LaunchCoordinator';

describe('LaunchCoordinator gate routing', () => {
  it('does not mount the app stack on a stale books route during reset recovery', () => {
    expect(shouldRenderGateChildren('device_onboarding', '/maintenance-settings')).toBe(false);
    expect(shouldRenderGateChildren('workplace_creation', '/maintenance-settings')).toBe(false);
  });

  it('mounts the app stack only on routes that are safe without a Workplace', () => {
    expect(shouldRenderGateChildren('device_onboarding', '/onboarding')).toBe(true);
    expect(shouldRenderGateChildren('workplace_creation', '/import-selection')).toBe(true);
    expect(shouldRenderGateChildren('picker', '/onboarding')).toBe(true);
  });
});
