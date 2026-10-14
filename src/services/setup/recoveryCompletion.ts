import { storage } from '@/src/utils/storage';
import { preferences } from '@/src/services/preferences';
import type { WorkplaceRecoveryResult } from '@/src/services/import/restoreWorkplaceSnapshot';
import { readSetupDraftSnapshot } from './launchProjection';
import { clearSetupDraft, loadSetupDraft } from './SetupDraftStore';
import { clearPendingCashClarityWorkplaceId } from './pendingWorkplace';

/** After successful recovery/activation, only the empty-device creation gate is satisfied. */
export function finishRecoveredWorkplaceSetup(expectedDraft: string | undefined): void {
  // Recovery must not discard another journey started while it was awaiting crypto/storage.
  if (readSetupDraftSnapshot() !== expectedDraft) return;
  const draft = loadSetupDraft();
  if (draft?.journeyId !== 'empty_device_workplace' || draft.entryPolicy !== 'blocking') return;
  clearSetupDraft();
  clearPendingCashClarityWorkplaceId();
}

/** These idempotent, nonsecret writes must finish once database publication has committed. */
export function completeRecoveredWorkplaceSetup(
  publication: WorkplaceRecoveryResult,
  expectedDraft: string | undefined,
  completionId: string,
): void {
  const receipt = `workplace_recovery_completion_v1_${publication.workplaceId}`;
  if (storage.getString(receipt) === completionId) return;
  if (publication.kind === 'restored')
    preferences.workplace.replace(publication.workplaceId, publication.bookPreferences);
  preferences.device.update({ activeWorkplaceId: publication.workplaceId, deviceRegistered: true });
  finishRecoveredWorkplaceSetup(expectedDraft);
  // Last synchronous write: retries after AsyncStorage acknowledgement failure must not undo later preferences.
  storage.set(receipt, completionId);
}
