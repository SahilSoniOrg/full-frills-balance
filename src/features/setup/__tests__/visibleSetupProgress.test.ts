import { Icon } from '@/src/types/domainIcons';
import { asWorkplaceId } from '@/src/types/ids';
import { getRestoreAutoOutput } from '../restoreAutoOutput';
import { getSetupRecipe } from '../setupRecipes';
import type { RestoreSetupDraft } from '../setupTypes';
import { visibleSetupProgress } from '../visibleSetupProgress';

const operationId = asWorkplaceId('setup-operation');

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
  it('counts imported identity and currency checkpoints dynamically', () => {
    const draft = restore({
      acceptedSlices: ['restore_source'],
      presentedHistory: ['restore_source', 'workplace'],
      restore: {
        sources: [
          {
            source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
            facts: {
              workplace: { name: 'Books', icon: Icon.Briefcase },
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
        currentSlice: 'workplace',
        workplaceCheckpoint: 'currency',
      }),
    ).toEqual({ current: 2, total: 3, completed: 1 });
  });

  it('omits imported workplace and device facts from the visible restore denominator', () => {
    const draft = restore({
      acceptedSlices: ['restore_source'],
      presentedHistory: ['restore_source'],
      restore: {
        sources: [
          {
            source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
            facts: {
              workplace: {
                name: 'Books',
                icon: Icon.Briefcase,
                defaultCurrencyCode: 'usd',
              },
              user: { name: 'Sahil' },
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
    ).toEqual({ current: 2, total: 2, completed: 1 });
  });
});
