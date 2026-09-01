import { shouldRenderGateChildren } from '../LaunchCoordinator';

describe('LaunchCoordinator gate routing', () => {
  it('does not mount the app stack on a stale books route during reset recovery', () => {
    expect(shouldRenderGateChildren('setup', '/maintenance-settings')).toBe(false);
  });

  it('mounts the app stack only on routes that are safe without a Workplace', () => {
    expect(shouldRenderGateChildren('setup', '/onboarding')).toBe(true);
    expect(shouldRenderGateChildren('setup', '/import-selection')).toBe(true);
    expect(shouldRenderGateChildren('picker', '/onboarding')).toBe(true);
  });
});
