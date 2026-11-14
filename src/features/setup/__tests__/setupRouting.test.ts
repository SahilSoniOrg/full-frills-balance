import { asWorkplaceId } from '@/src/types/ids';
import { requestedRestoreJourney, setupJourneyConflicts } from '../setupRouting';
import { resolveOptionalJourney } from '../setupRuntime';
import type { SetupDraft } from '../setupTypes';

const operationId = asWorkplaceId('operation');

const creation = {
  schemaVersion: 2,
  kind: 'cash_clarity',
  journeyId: 'add_workplace',
  intent: 'add_workplace',
  context: 'existing_workplace_entry',
  entryPolicy: 'optional',
  operationId,
  draft: {},
  editableInput: { amountTextById: {} },
  inputLocale: 'en-US',
  step: 'currency',
  history: [],
  completedActions: [],
} as unknown as SetupDraft;

const restore = {
  schemaVersion: 1,
  kind: 'restore',
  journeyId: 'picker_restore',
  entryPolicy: 'optional',
  operationId,
  presentedHistory: [],
  acceptedSlices: [],
  restore: {},
} as unknown as SetupDraft;

describe('setupJourneyConflicts', () => {
  it('requires a decision before a creation session is replaced by restore', () => {
    expect(setupJourneyConflicts(creation, 'settings_restore')).toBe(true);
  });

  it('requires a decision when the saved restore journey is different', () => {
    expect(setupJourneyConflicts(restore, 'settings_restore')).toBe(true);
  });

  it('continues when the requested restore is the saved one', () => {
    expect(setupJourneyConflicts(restore, 'picker_restore')).toBe(false);
    expect(setupJourneyConflicts(undefined, 'settings_restore')).toBe(false);
  });

  it('keeps the journey this visit asked for, including when an override is set', () => {
    expect(requestedRestoreJourney('settings_restore')).toBe('settings_restore');
    expect(requestedRestoreJourney('picker_restore', 'settings_restore')).toBe('settings_restore');
    expect(requestedRestoreJourney(undefined)).toBeUndefined();
    expect(requestedRestoreJourney('first_run')).toBeUndefined();
    for (const journey of [
      'first_run_restore',
      'empty_device_restore',
      'picker_restore',
      'settings_restore',
    ] as const) {
      expect(requestedRestoreJourney(journey)).toBe(resolveOptionalJourney({ journey }));
    }
  });
});
