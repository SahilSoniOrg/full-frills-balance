import { useSelectedItemMap } from '@/src/hooks/useSelectedItemMap';
import { useSelection } from '@/src/hooks/useSelection';
import { act, renderHook } from '@testing-library/react-native';

interface TestItem {
  id: string;
  name: string;
}

describe('useSelectedItemMap', () => {
  const items: TestItem[] = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
  ];

  it('indexes all items and resolves selected items in selection order', () => {
    const { result } = renderHook(() => {
      const selection = useSelection<string>();
      const map = useSelectedItemMap<TestItem, string>(items, selection);
      return { selection, map };
    });

    expect(result.current.map.itemsById.size).toBe(3);
    expect(result.current.map.itemsById.get('2')).toEqual({ id: '2', name: 'Item 2' });
    expect(result.current.map.selectedItems).toEqual([]);

    act(() => {
      result.current.selection.toggleSelection('1');
      result.current.selection.toggleSelection('3');
    });

    expect(result.current.selection.selectedIds.size).toBe(2);
    expect(result.current.map.selectedItems).toEqual([
      { id: '1', name: 'Item 1' },
      { id: '3', name: 'Item 3' },
    ]);
  });

  it('preserves stable references across renders when props are unchanged', () => {
    const { result } = renderHook(() => {
      const selection = useSelection<string>();
      return { selection, map: useSelectedItemMap<TestItem, string>(items, selection) };
    });

    const firstItemsById = result.current.map.itemsById;
    const firstSelectedItems = result.current.map.selectedItems;

    act(() => {
      result.current.selection.toggleSelection('1');
    });

    const afterSelectItemsById = result.current.map.itemsById;
    const afterSelectSelected = result.current.map.selectedItems;

    // itemsById must not recompute just because selection changed.
    expect(afterSelectItemsById).toBe(firstItemsById);
    // selectedItems must recompute only when the selected set changes.
    expect(afterSelectSelected).not.toBe(firstSelectedItems);
  });
});
