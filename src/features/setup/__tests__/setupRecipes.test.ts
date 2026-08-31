import { getSetupRecipe } from '../setupRecipes';
import type { SetupJourneyId } from '../setupTypes';

describe('Setup recipes', () => {
  it.each([
    ['first_run', ['device', 'workplace', 'appearance', 'summary']],
    [
      'first_run_restore',
      [
        'restore_source',
        'workplace',
        'publish_restore',
        'restore_summary',
        'device',
        'appearance',
        'summary',
      ],
    ],
    ['empty_device_workplace', ['workplace', 'summary']],
    ['empty_device_restore', ['restore_source', 'workplace', 'publish_restore', 'restore_summary']],
    ['picker_restore', ['restore_source', 'workplace', 'publish_restore', 'restore_summary']],
    ['settings_restore', ['restore_source', 'workplace', 'publish_restore', 'restore_summary']],
    ['create_workplace', ['workplace', 'summary']],
  ] as const)('%s contains the canonical linear order', (journeyId, expected) => {
    const recipe = getSetupRecipe(journeyId as SetupJourneyId);
    expect(
      recipe.entries.map(entry => (entry.kind === 'slice' ? entry.sliceId : entry.effectId)),
    ).toEqual(expected);
  });

  it('keeps picker restore blocking while selected and Settings restore optional', () => {
    expect(getSetupRecipe('picker_restore').entryPolicy).toBe('blocking');
    expect(getSetupRecipe('settings_restore').entryPolicy).toBe('optional');
  });
});
