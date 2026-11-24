import { getSelectionState } from '../selectionState';

describe('getSelectionState', () => {
  it.each([
    { selected: [], selectable: [], checked: false },
    { selected: ['hidden'], selectable: [], checked: false },
    { selected: ['hidden'], selectable: ['visible'], checked: false },
    { selected: ['a', 'hidden'], selectable: ['a', 'b'], checked: 'mixed' },
    { selected: ['a', 'b', 'hidden'], selectable: ['a', 'b'], checked: true },
    { selected: ['a'], selectable: ['a', 'a'], checked: true },
  ] as const)(
    'compares selected $selected with selectable $selectable',
    ({ selected, selectable, checked }) => {
      expect(getSelectionState(new Set<string>(selected), selectable)).toEqual({
        selectedCount: selected.length,
        selectableCount: selectable.length,
        checked,
      });
    },
  );
});
