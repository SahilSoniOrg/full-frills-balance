import { shouldRedirectToPrivacyNotice, shouldRenderGateChildren } from '../LaunchCoordinator';

describe('LaunchCoordinator gate routing', () => {
  it('does not mount the app stack on a stale books route during reset recovery', () => {
    expect(shouldRenderGateChildren('setup', '/maintenance-settings')).toBe(false);
  });

  it('mounts the app stack only on routes that are safe without a Workplace', () => {
    expect(shouldRenderGateChildren('setup', '/onboarding')).toBe(true);
    expect(shouldRenderGateChildren('setup', '/import-selection')).toBe(true);
    expect(shouldRenderGateChildren('setup', '/privacy-notice')).toBe(true);
    expect(shouldRenderGateChildren('picker', '/onboarding')).toBe(true);
  });

  it('lets first-run setup reach the name screen before showing privacy acknowledgement', () => {
    expect(shouldRedirectToPrivacyNotice('setup', '/onboarding', false)).toBe(false);
  });

  it('keeps the current-policy gate for existing users', () => {
    expect(shouldRedirectToPrivacyNotice('picker', '/', false)).toBe(true);
    expect(shouldRedirectToPrivacyNotice('open', '/', false)).toBe(true);
    expect(shouldRedirectToPrivacyNotice('open', '/', true)).toBe(false);
    expect(shouldRedirectToPrivacyNotice('open', '/privacy-notice', false)).toBe(false);
  });
});
