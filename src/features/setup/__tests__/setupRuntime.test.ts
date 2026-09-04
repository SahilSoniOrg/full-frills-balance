import { asWorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { discardRestorePublication } from '../setupFinishers';
import { clearSetupDraft, loadSetupDraft, saveSetupDraft } from '../SetupDraftStore';
import { getSetupRecipe } from '../setupRecipes';
import {
  abandonRestoreJourney,
  applySetupOutcome,
  createJourneyCoordinator,
  restoreLeaveNeedsConfirm,
} from '../setupRuntime';
import type { RestoreSetupDraft } from '../setupTypes';

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { toDashboard: jest.fn(), toSettings: jest.fn(), back: jest.fn() },
}));
jest.mock('../setupFinishers', () => ({
  discardRestorePublication: jest.fn(),
  finishDeviceSetup: jest.fn(),
  finishSetup: jest.fn(),
}));
jest.mock('../SetupDraftStore', () => ({
  clearSetupDraft: jest.fn(),
  loadSetupDraft: jest.fn(),
  saveSetupDraft: jest.fn(),
}));

const operationId = asWorkplaceId('operation');

function restoreDraft(handoff: boolean): RestoreSetupDraft {
  return {
    schemaVersion: 1,
    kind: 'restore',
    journeyId: 'first_run_restore',
    entryPolicy: 'blocking',
    operationId,
    presentedHistory: ['restore_source'],
    acceptedSlices: ['restore_source'],
    restore: {
      source: {
        source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
        facts: { workplace: { name: 'Books' } },
      },
      deviceCandidate: { value: 'Sahil', source: 'user_entered' },
      ...(handoff
        ? {
            handoff: {
              operationId,
              workplaceId: operationId,
              fingerprint: 'abc',
              facts: { workplace: { name: 'Books' } },
              stats: { accounts: 1, journals: 0, transactions: 0, skippedTransactions: 0 },
              warnings: [],
            },
          }
        : {}),
    },
  };
}

describe('abandon restore', () => {
  const discard = discardRestorePublication as jest.Mock;
  const clear = clearSetupDraft as jest.Mock;

  beforeEach(() => {
    discard.mockReset().mockResolvedValue(undefined);
    clear.mockReset();
    (AppNavigation.toDashboard as jest.Mock).mockReset();
  });

  it('confirms only after restore books were published', () => {
    expect(restoreLeaveNeedsConfirm(restoreDraft(false))).toBe(false);
    expect(restoreLeaveNeedsConfirm(restoreDraft(true))).toBe(true);
  });

  it('deletes published books, clears the draft, then follows discardTo', async () => {
    const onSwitchJourney = jest.fn();
    await abandonRestoreJourney(
      restoreDraft(true),
      getSetupRecipe('first_run_restore'),
      onSwitchJourney,
    );
    expect(discard).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(onSwitchJourney).toHaveBeenCalledWith('first_run', 'Sahil');
  });

  it('returns picker restore to the dashboard after abandon', async () => {
    await abandonRestoreJourney(restoreDraft(false), getSetupRecipe('picker_restore'), jest.fn());
    expect(AppNavigation.toDashboard).toHaveBeenCalledTimes(1);
  });

  it('keeps first-run name when discarding back to device setup', () => {
    const onSwitchJourney = jest.fn();
    applySetupOutcome(
      { kind: 'journey_discarded' },
      getSetupRecipe('first_run_restore'),
      onSwitchJourney,
      'Sahil',
    );
    expect(onSwitchJourney).toHaveBeenCalledWith('first_run', 'Sahil');
  });
});

describe('journey coordinator construction', () => {
  it('does not persist a seeded draft during construction', () => {
    (loadSetupDraft as jest.Mock).mockReturnValue(undefined);
    (saveSetupDraft as jest.Mock).mockReset();

    createJourneyCoordinator('create_workplace');

    expect(saveSetupDraft).not.toHaveBeenCalled();
  });
});
