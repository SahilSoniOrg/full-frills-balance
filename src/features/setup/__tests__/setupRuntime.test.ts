import { asWorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { discardRestorePublication } from '../setupFinishers';
import { clearSetupDraft, loadSetupDraft, saveSetupDraft } from '../SetupDraftStore';
import { getSetupRecipe } from '../setupRecipes';
import {
  abandonRestoreJourney,
  applySetupOutcome,
  createJourneyCoordinator,
  resolveOptionalJourney,
  resolveSetupJourney,
  restoreLeaveNeedsConfirm,
  shouldExitCompletedFirstRunRestore,
} from '../setupRuntime';
import type { RestoreSetupDraft } from '../setupTypes';

jest.mock('@/src/navigation/AppNavigation', () => ({
  AppNavigation: {
    toDashboard: jest.fn(),
    toSettings: jest.fn(),
    returnToSettings: jest.fn(),
    toFirstRun: jest.fn(),
    back: jest.fn(),
    toAddWorkplace: jest.fn(),
  },
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

describe('completed first-run restore', () => {
  it('leaves the stale route only after registration and draft clearance', () => {
    expect(shouldExitCompletedFirstRunRestore('first_run_restore', false, true)).toBe(true);
    expect(shouldExitCompletedFirstRunRestore('first_run_restore', true, true)).toBe(false);
    expect(shouldExitCompletedFirstRunRestore('first_run_restore', false, false)).toBe(false);
    expect(shouldExitCompletedFirstRunRestore('picker_restore', false, true)).toBe(false);
  });
});

function restoreDraft(
  handoff: boolean,
  journeyId: RestoreSetupDraft['journeyId'] = 'first_run_restore',
): RestoreSetupDraft {
  return {
    schemaVersion: 1,
    kind: 'restore',
    journeyId,
    entryPolicy: journeyId === 'settings_restore' ? 'optional' : 'blocking',
    operationId,
    presentedHistory: ['restore_source'],
    acceptedSlices: ['restore_source'],
    restore: {
      sources: [
        {
          source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
          facts: { workplace: { name: 'Books' } },
        },
      ],
      deviceCandidate: { value: 'Sahil', source: 'user_entered' },
      ...(handoff
        ? {
            handoffs: [
              {
                operationId,
                workplaceId: operationId,
                fingerprint: 'abc',
                facts: { workplace: { name: 'Books' } },
                stats: { accounts: 1, journals: 0, transactions: 0, skippedTransactions: 0 },
                warnings: [],
              },
            ],
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
    jest.mocked(AppNavigation.returnToSettings).mockClear();
    (AppNavigation.toDashboard as jest.Mock).mockReset();
    (AppNavigation.toFirstRun as jest.Mock).mockReset();
    (AppNavigation.toAddWorkplace as jest.Mock).mockReset();
    (AppNavigation.back as jest.Mock).mockReset();
  });

  it('confirms only after restore books were published', () => {
    expect(restoreLeaveNeedsConfirm(restoreDraft(false))).toBe(false);
    expect(restoreLeaveNeedsConfirm(restoreDraft(true))).toBe(true);
  });

  it('deletes published books, clears the draft, then follows discardTo', async () => {
    await abandonRestoreJourney(restoreDraft(true), getSetupRecipe('first_run_restore'));
    expect(discard).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(AppNavigation.toFirstRun).toHaveBeenCalledWith('Sahil');
  });

  it('returns picker restore to the dashboard after abandon', async () => {
    await abandonRestoreJourney(
      restoreDraft(false, 'picker_restore'),
      getSetupRecipe('picker_restore'),
    );
    expect(AppNavigation.toDashboard).toHaveBeenCalledTimes(1);
  });

  it('dismisses Settings/drawer restore back to Settings after abandon', async () => {
    await abandonRestoreJourney(
      restoreDraft(false, 'settings_restore'),
      getSetupRecipe('settings_restore'),
    );
    expect(AppNavigation.returnToSettings).toHaveBeenCalledTimes(1);
    expect(AppNavigation.back).not.toHaveBeenCalled();
    expect(AppNavigation.toSettings).not.toHaveBeenCalled();
  });

  it('stays on Settings after accepting restore without opening books', () => {
    applySetupOutcome(
      { kind: 'restore_accepted', workplaceId: operationId, next: 'stay' },
      getSetupRecipe('settings_restore'),
    );
    expect(AppNavigation.returnToSettings).toHaveBeenCalledTimes(1);
    expect(AppNavigation.toSettings).not.toHaveBeenCalled();
  });

  it('returns first-run restore to onboarding with the entered name', () => {
    applySetupOutcome({ kind: 'journey_discarded' }, getSetupRecipe('first_run_restore'), 'Sahil');
    expect(AppNavigation.toFirstRun).toHaveBeenCalledWith('Sahil');
  });
});

describe('restore routing', () => {
  it('keeps legacy creation aliases out of the restore coordinator', () => {
    expect(resolveOptionalJourney({ journey: 'create_workplace' })).toBeUndefined();
    expect(resolveOptionalJourney({ journey: 'empty_device_workplace' })).toBeUndefined();
    expect(resolveOptionalJourney({ mode: 'full' })).toBeUndefined();
  });

  it('keeps an existing blocking restore ahead of a creation route parameter', () => {
    (loadSetupDraft as jest.Mock).mockReturnValue(restoreDraft(false));
    expect(resolveSetupJourney({ journey: 'add_workplace', mode: 'full' })).toBe(
      'first_run_restore',
    );
  });

  it('replaces empty-device restore with the typed blocking creation entry on discard', async () => {
    await abandonRestoreJourney(
      restoreDraft(false, 'empty_device_restore'),
      getSetupRecipe('empty_device_restore'),
    );
    expect(AppNavigation.toAddWorkplace).toHaveBeenCalledWith({
      context: 'registered_empty_device',
      origin: '/onboarding?journey=empty_device_restore',
      navigation: 'replace',
    });
  });
});

describe('journey coordinator construction', () => {
  it('does not persist a seeded draft during construction', () => {
    (loadSetupDraft as jest.Mock).mockReturnValue(undefined);
    (saveSetupDraft as jest.Mock).mockReset();

    createJourneyCoordinator('picker_restore');

    expect(saveSetupDraft).not.toHaveBeenCalled();
  });
});
