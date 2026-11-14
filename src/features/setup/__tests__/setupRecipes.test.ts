import { getSetupRecipe, SETUP_RECIPES } from '../setupRecipes';

describe('Setup recipes', () => {
  it.each([
    [
      'first_run_restore',
      ['restore_source', 'workplace', 'restore_summary', 'publish_restore', 'device'],
    ],
    ['empty_device_restore', ['restore_source', 'workplace', 'restore_summary', 'publish_restore']],
    ['picker_restore', ['restore_source', 'workplace', 'restore_summary', 'publish_restore']],
    ['settings_restore', ['restore_source', 'workplace', 'restore_summary', 'publish_restore']],
  ] as const)('%s contains the canonical linear order', (journeyId, expected) => {
    const recipe = getSetupRecipe(journeyId);
    expect(
      recipe.entries.map(entry => (entry.kind === 'slice' ? entry.sliceId : entry.effectId)),
    ).toEqual(expected);
  });

  it('keeps picker restore blocking while selected and Settings restore optional', () => {
    expect(getSetupRecipe('picker_restore').entryPolicy).toBe('blocking');
    expect(getSetupRecipe('settings_restore').entryPolicy).toBe('optional');
  });

  it('keeps restore workplace identity editable', () => {
    expect(getSetupRecipe('first_run_restore').workplaceIdentity).toBe('editable');
    expect(getSetupRecipe('empty_device_restore').workplaceIdentity).toBe('editable');
  });

  it('contains only the four restore recipes and owns their return metadata', () => {
    expect(Object.keys(SETUP_RECIPES)).toEqual([
      'first_run_restore',
      'empty_device_restore',
      'picker_restore',
      'settings_restore',
    ]);
    expect(getSetupRecipe('first_run_restore')).toMatchObject({
      atStart: 'first_run',
      discardTo: 'first_run',
    });
    expect(getSetupRecipe('empty_device_restore')).toMatchObject({
      atStart: 'add_workplace',
      discardTo: 'add_workplace',
    });
    expect(getSetupRecipe('first_run_restore').restoreSummary).toEqual({
      primary: { intent: 'continue', label: 'Restore and continue' },
    });
    expect(getSetupRecipe('picker_restore').restoreSummary?.secondary?.intent).toBe(
      'return_to_picker',
    );
    expect(getSetupRecipe('settings_restore')).toMatchObject({
      atStart: 'back',
      discardTo: 'settings',
      restoreSummary: {
        primary: { intent: 'open', label: 'Open workplace' },
        secondary: { intent: 'stay', label: 'Stay here' },
      },
    });
  });
});
