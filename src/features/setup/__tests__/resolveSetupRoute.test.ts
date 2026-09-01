import { resolveSetupRoute } from '../resolveSetupRoute';

describe('resolveSetupRoute', () => {
  it('preserves the imported-Workplace acknowledgement route', () => {
    expect(resolveSetupRoute({ stage: 'post_import' })).toBe('legacy_post_import');
    expect(resolveSetupRoute({ hasPendingImportedWorkplace: true })).toBe('legacy_post_import');
  });

  it('selects only journeys rendered by SetupScreen', () => {
    expect(resolveSetupRoute({})).toBe('first_run');
    expect(resolveSetupRoute({ mode: 'full' })).toBe('create_workplace');
  });
});
