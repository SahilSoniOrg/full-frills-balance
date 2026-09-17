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
    expect(screen).toContain('startFirstRunRestoreFromDeviceName');
    expect(source('../SetupCoordinator.ts')).toContain("createSetupDraft('first_run_restore'");
    expect(source('../SetupCoordinator.ts')).toContain('deviceCandidate');
  });

  it('routes picker and Settings import into restore journeys', () => {
    expect(source('../../app/LaunchCoordinator.tsx')).toContain("journey: 'picker_restore'");
    expect(source('../../app/LaunchCoordinator.tsx')).toContain("journey: 'create_workplace'");
    expect(source('../../settings/hooks/useDataManagementViewModel.ts')).toContain(
      "toSetupJourney('settings_restore')",
    );
  });

  it('keeps the legacy import-selection path explicitly owned by the app route', () => {
    const route = source('../../../../app/import-selection.tsx');
    expect(route).toContain("from '@/src/features/settings'");
    expect(route).toContain('export default ImportSelectionScreen');
    expect(source('../../settings/index.ts')).toContain('ImportSelectionScreen');
  });
});
