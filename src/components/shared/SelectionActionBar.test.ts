import { Icon } from '@/src/types/domainIcons';
import {
  partitionSelectionActions,
  type SelectionAction,
} from '@/src/components/shared/SelectionActionBar';

describe('partitionSelectionActions', () => {
  const action = (name: SelectionAction['name'], options: Partial<SelectionAction> = {}) => ({
    name,
    onPress: jest.fn(),
    ...options,
  });

  it('keeps up to three applicable actions on the bar', () => {
    const result = partitionSelectionActions([
      action(Icon.Edit),
      action(Icon.Copy),
      action(Icon.Share, { isPrimary: true }),
    ]);

    expect(result.barActions.map(item => item.name)).toEqual(['edit', 'copy', 'share']);
    expect(result.overflowActions).toEqual([]);
  });

  it('moves actions beyond three into overflow', () => {
    const result = partitionSelectionActions([
      action(Icon.Edit),
      action(Icon.Copy),
      action(Icon.Share, { isPrimary: true }),
      action(Icon.Delete, { isPrimary: true }),
    ]);

    expect(result.barActions.map(item => item.name)).toEqual(['share', 'delete']);
    expect(result.overflowActions.map(item => item.name)).toEqual(['edit', 'copy']);
  });

  it('keeps disabled actions in place so enabling them cannot move other controls', () => {
    const result = partitionSelectionActions([
      action(Icon.Edit),
      action(Icon.Merge, { disabled: true }),
      action(Icon.Delete, { isPrimary: true }),
    ]);

    expect(result.barActions.map(item => item.name)).toEqual(['edit', 'merge', 'delete']);
    expect(result.barActions[1].disabled).toBe(true);
    expect(result.overflowActions).toEqual([]);
    const enabled = partitionSelectionActions(
      result.barActions.map(item => ({ ...item, disabled: false })),
    );
    expect(enabled.barActions.map(item => item.name)).toEqual(
      result.barActions.map(item => item.name),
    );
  });
});
