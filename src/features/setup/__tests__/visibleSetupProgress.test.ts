import { asWorkplaceId } from '@/src/types/ids';
import { getRestoreAutoOutput } from '../restoreAutoOutput';
import { getSetupRecipe } from '../setupRecipes';
import type { FirstRunSetupDraft, RestoreSetupDraft } from '../setupTypes';
import { visibleSetupProgress } from '../visibleSetupProgress';

const operationId = asWorkplaceId('setup-operation');

function firstRun(overrides: Partial<FirstRunSetupDraft> = {}): FirstRunSetupDraft {
  return {
    schemaVersion: 1,
    kind: 'first_run',
    journeyId: 'first_run',
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
  it('counts first-run workplace screens instead of the workplace slice', () => {
    const draft = firstRun({
      acceptedSlices: ['device'],
      presentedHistory: ['device'],
    });
    expect(
      visibleSetupProgress({
        recipe: getSetupRecipe('first_run'),
        draft,
        currentSlice: 'workplace',
        workplaceCheckpoint: 'currency',
      }),
    ).toEqual({ current: 2, total: 6, completed: 1 });
  });

  it('keeps edit-from-summary on the accounts screen in the same denominator', () => {
    const draft = firstRun({
      acceptedSlices: ['device', 'workplace', 'appearance', 'summary'],
      presentedHistory: ['device', 'workplace', 'appearance', 'summary'],
      activeSlice: 'workplace',
    });
    expect(
      visibleSetupProgress({
        recipe: getSetupRecipe('first_run'),
        draft,
        currentSlice: 'workplace',
        workplaceCheckpoint: 'accounts',
      }),
    ).toEqual({ current: 3, total: 6, completed: 2 });
  });

  it('does not inflate restore progress with starter book screens', () => {
    const draft = restore({
      acceptedSlices: ['restore_source', 'workplace'],
      presentedHistory: ['restore_source'],
      restore: {
        source: {
          source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
          facts: {
            workplace: { name: 'Books', icon: 'briefcase', defaultCurrencyCode: 'usd' },
          },
        },
        handoff: {
          operationId,
          workplaceId: asWorkplaceId('published-workplace'),
          fingerprint: 'fingerprint',
          facts: { workplace: {} },
          stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
          warnings: [],
        },
      },
    });
    expect(
      visibleSetupProgress({
        recipe: getSetupRecipe('first_run_restore'),
        draft,
        definitions: { getAutoOutput: getRestoreAutoOutput },
        currentSlice: 'restore_summary',
      }),
    ).toEqual({ current: 2, total: 4, completed: 1 });
  });
});
