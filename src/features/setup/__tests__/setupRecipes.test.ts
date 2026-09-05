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
        'restore_summary',
        'publish_restore',
        'device',
        'appearance',
        'summary',
      ],
    ],
    ['empty_device_workplace', ['workplace', 'summary']],
    ['empty_device_restore', ['restore_source', 'workplace', 'restore_summary', 'publish_restore']],
    ['picker_restore', ['restore_source', 'workplace', 'restore_summary', 'publish_restore']],
    ['settings_restore', ['restore_source', 'workplace', 'restore_summary', 'publish_restore']],
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

  it('keeps workplace identity policy in the journey recipe', () => {
    expect(getSetupRecipe('first_run').workplaceIdentity).toBe('automatic');
    expect(getSetupRecipe('empty_device_workplace').workplaceIdentity).toBe('automatic');
    expect(getSetupRecipe('create_workplace').workplaceIdentity).toBe('editable');
    expect(getSetupRecipe('first_run_restore').workplaceIdentity).toBe('editable');
  });

  it('owns draft kind, leave, and discard metadata', () => {
    expect(getSetupRecipe('create_workplace')).toMatchObject({
      draftKind: 'workplace_creation',
      entryPolicy: 'optional',
      atStart: 'back',
    });
    expect(getSetupRecipe('first_run_restore')).toMatchObject({
      draftKind: 'restore',
      atStart: 'first_run',
      discardTo: 'first_run',
    });
    expect(getSetupRecipe('empty_device_workplace').draftKind).toBe('workplace_creation');
    expect(getSetupRecipe('first_run_restore').restoreSummary).toEqual({
      primary: { intent: 'continue', label: 'Continue setup' },
    });
    expect(getSetupRecipe('picker_restore').restoreSummary?.secondary?.intent).toBe(
      'return_to_picker',
    );
  });
});
