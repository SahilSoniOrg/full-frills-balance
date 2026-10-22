import { finishDeviceSetup } from './setupFinishers';
import { defaultDeviceDisplayName } from './first-run/localeDefaults';
import { clearSetupDraft, loadSetupDraft } from '@/src/services/setup/SetupDraftStore';
import { preferences } from '@/src/services/preferences';
import type { WorkplaceId } from '@/src/types/ids';

function resolveDisplayName(): string {
  const draft = loadSetupDraft();
  const fromDraft =
    draft?.kind === 'restore' ? draft.restore.deviceCandidate?.value?.trim() : undefined;
  const fromPrefs = preferences.userName?.trim();
  return fromDraft || fromPrefs || defaultDeviceDisplayName();
}

/** Registers the Device, activates the restored Workplace, and clears blocking setup drafts. */
export function completeEncryptedRestoreLaunch(workplaceId: WorkplaceId): void {
  if (!preferences.device.deviceRegistered) {
    finishDeviceSetup({
      displayName: { value: resolveDisplayName(), source: 'user_entered' },
    });
  }
  preferences.device.setActiveWorkplaceId(workplaceId);
  clearSetupDraft();
}

export function needsEncryptedRestoreLaunchCompletion(): boolean {
  return !preferences.device.deviceRegistered || loadSetupDraft()?.entryPolicy === 'blocking';
}
