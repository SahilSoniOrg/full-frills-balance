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
