import { readFileSync } from 'fs';
import { join } from 'path';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf8');
}

describe('restore journey entry', () => {
  it('starts first-run Restore as a Setup journey instead of import-selection', () => {
    const screen = source('../SetupScreen.tsx');
    expect(screen).not.toContain('toImportSelection');
    expect(screen).not.toContain('OnboardingScreen');
    expect(screen).toContain("createSetupDraft('first_run_restore'");
    expect(screen).toContain('deviceCandidate');
  });

  it('routes picker and Settings import into restore journeys', () => {
    expect(source('../../app/LaunchCoordinator.tsx')).toContain("journey: 'picker_restore'");
    expect(source('../../app/LaunchCoordinator.tsx')).toContain("journey: 'create_workplace'");
    expect(source('../../settings/hooks/useDataManagementViewModel.ts')).toContain(
      "toSetupJourney('settings_restore')",
    );
  });
});
