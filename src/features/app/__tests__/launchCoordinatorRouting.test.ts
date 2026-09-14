import {
  setupEntryPath,
  shouldRedirectSetupToEntry,
  shouldRedirectToPrivacyNotice,
  shouldRenderGateChildren,
} from '../LaunchCoordinator';

describe('LaunchCoordinator gate routing', () => {
  it('does not mount the app stack on a stale books route during reset recovery', () => {
    expect(shouldRenderGateChildren('setup', '/maintenance-settings')).toBe(false);
  });

  it('mounts the app stack only on routes that are safe without a Workplace', () => {
    expect(shouldRenderGateChildren('setup', '/onboarding', 'first_run_restore')).toBe(true);
    expect(shouldRenderGateChildren('setup', '/onboarding-v2', 'first_run')).toBe(true);
    expect(shouldRenderGateChildren('setup', '/import-selection', 'first_run_restore')).toBe(true);
    expect(shouldRenderGateChildren('setup', '/privacy-notice', 'first_run')).toBe(true);
    expect(shouldRenderGateChildren('picker', '/onboarding')).toBe(true);
  });

  it('does not mount the legacy wizard or import-selection during first-run', () => {
    expect(shouldRenderGateChildren('setup', '/onboarding', 'first_run')).toBe(false);
    expect(shouldRenderGateChildren('setup', '/import-selection', 'first_run')).toBe(false);
  });

  it('lets first-run setup reach the name screen before showing privacy acknowledgement', () => {
    expect(shouldRedirectToPrivacyNotice('setup', '/onboarding', false)).toBe(false);
    expect(shouldRedirectToPrivacyNotice('setup', '/onboarding-v2', false)).toBe(false);
  });

  it('sends a new device into cash-clarity onboarding, not the old wizard', () => {
    expect(setupEntryPath('first_run')).toBe('/onboarding-v2');
    expect(setupEntryPath('first_run_restore')).toBe('/onboarding');
    expect(setupEntryPath('create_workplace')).toBe('/onboarding');
  });

  it('keeps first-run off the legacy wizard and import-selection deep links', () => {
    expect(shouldRedirectSetupToEntry('first_run', '/onboarding')).toBe(true);
    expect(shouldRedirectSetupToEntry('first_run', '/import-selection')).toBe(true);
    expect(shouldRedirectSetupToEntry('first_run', '/dashboard')).toBe(true);
    expect(shouldRedirectSetupToEntry('first_run', '/onboarding-v2')).toBe(false);
    expect(shouldRedirectSetupToEntry('first_run', '/privacy-notice')).toBe(false);
    expect(shouldRedirectSetupToEntry('first_run_restore', '/onboarding')).toBe(false);
    expect(shouldRedirectSetupToEntry('first_run_restore', '/import-selection')).toBe(false);
  });

  it('keeps the current-policy gate for existing users', () => {
    expect(shouldRedirectToPrivacyNotice('picker', '/', false)).toBe(true);
    expect(shouldRedirectToPrivacyNotice('open', '/', false)).toBe(true);
    expect(shouldRedirectToPrivacyNotice('open', '/', true)).toBe(false);
    expect(shouldRedirectToPrivacyNotice('open', '/privacy-notice', false)).toBe(false);
  });
});
