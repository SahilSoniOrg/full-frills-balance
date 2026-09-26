import { Icon } from '@/src/types/domainIcons';
import { asWorkplaceId } from '@/src/types/ids';
import { getRestoreAutoOutput } from '../restoreAutoOutput';
import { getSetupRecipe } from '../setupRecipes';
import type { RestoreSetupDraft, WorkplaceCreationSetupDraft } from '../setupTypes';
import { visibleSetupProgress } from '../visibleSetupProgress';

const operationId = asWorkplaceId('setup-operation');

function workplaceCreation(
  overrides: Partial<WorkplaceCreationSetupDraft> = {},
): WorkplaceCreationSetupDraft {
  return {
    schemaVersion: 1,
    kind: 'workplace_creation',
    journeyId: 'empty_device_workplace',
    entryPolicy: 'blocking',
    operationId,
    presentedHistory: [],
    acceptedSlices: [],
    ...overrides,
  };
}

function restore(overrides: Partial<RestoreSetupDraft> = {}): RestoreSetupDraft {
  return {
    schemaVersion: 1,
    kind: 'restore',
    journeyId: 'first_run_restore',
    entryPolicy: 'blocking',
    operationId,
    presentedHistory: [],
    acceptedSlices: [],
    restore: {},
    ...overrides,
  };
}

describe('visibleSetupProgress', () => {
  it('counts workplace screens instead of the workplace slice', () => {
    const draft = workplaceCreation();
    expect(
      visibleSetupProgress({
        recipe: getSetupRecipe('empty_device_workplace'),
        draft,
        currentSlice: 'workplace',
        workplaceCheckpoint: 'currency',
      }),
    ).toEqual({ current: 1, total: 4, completed: 0 });
  });

  it('keeps edit-from-summary on the accounts screen in the same denominator', () => {
    const draft = workplaceCreation({
      acceptedSlices: ['workplace', 'summary'],
      presentedHistory: ['workplace', 'summary'],
      activeSlice: 'workplace',
    });
    expect(
      visibleSetupProgress({
        recipe: getSetupRecipe('empty_device_workplace'),
        draft,
        currentSlice: 'workplace',
        workplaceCheckpoint: 'accounts',
      }),
    ).toEqual({ current: 2, total: 4, completed: 1 });
  });

  it('does not inflate restore progress with starter book screens', () => {
    const draft = restore({
      acceptedSlices: ['restore_source', 'workplace'],
      presentedHistory: ['restore_source'],
      restore: {
        sources: [
          {
            source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
            facts: {
              workplace: { name: 'Books', icon: Icon.Briefcase, defaultCurrencyCode: 'usd' },
            },
          },
        ],
      },
    });
    expect(
      visibleSetupProgress({
        recipe: getSetupRecipe('first_run_restore'),
        draft,
        definitions: { getAutoOutput: getRestoreAutoOutput },
        currentSlice: 'restore_summary',
      }),
    ).toEqual({ current: 2, total: 3, completed: 1 });
  });
});
