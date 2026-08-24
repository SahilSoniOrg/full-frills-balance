import {
  buildListSelectionActions,
  type SelectionActionDefinition,
} from '@/src/hooks/useListSelection';

describe('buildListSelectionActions', () => {
  const action = {
    name: 'edit' as const,
    onPress: jest.fn(),
  };

  it('hides actions that are not visible for the selection count', () => {
    const definitions: SelectionActionDefinition[] = [{ action, isVisible: count => count > 1 }];

    expect(buildListSelectionActions(definitions, 1)).toEqual([]);
  });

  it('marks visible actions disabled when their predicate fails', () => {
    const definitions: SelectionActionDefinition[] = [{ action, isEnabled: count => count > 1 }];

    expect(buildListSelectionActions(definitions, 1)[0].disabled).toBe(true);
    expect(buildListSelectionActions(definitions, 2)[0].disabled).toBe(false);
  });
});
