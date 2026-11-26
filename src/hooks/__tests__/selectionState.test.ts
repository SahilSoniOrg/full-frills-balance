import { getSelectionState, pruneSelectedIds } from '../selectionState';

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
        selectedSelectableCount: selectable.filter(id => selected.some(value => value === id))
          .length,
        selectableCount: selectable.length,
        checked,
      });
    },
  );
});

describe('pruneSelectedIds', () => {
  it('returns the same set reference when every id is still valid', () => {
    const selected = new Set(['a', 'b']);
    expect(pruneSelectedIds(selected, ['a', 'b', 'c'])).toBe(selected);
  });

  it('drops ids that are no longer valid', () => {
    const selected = new Set(['a', 'gone']);
    expect([...pruneSelectedIds(selected, ['a', 'b'])]).toEqual(['a']);
  });
});
