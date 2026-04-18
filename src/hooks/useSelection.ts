import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';

export interface UseSelectionOptions<T> {
  onSelectionChange?: (selectedIds: Set<T>) => void;
  onEnterSelectionMode?: () => void;
  onExitSelectionMode?: () => void;
}

export interface UseSelectionResult<T> {
  selectedIds: Set<T>;
  isSelectionModeActive: boolean;
  toggleSelection: (id: T) => void;
  onLongPressItem: (id: T) => void;
  selectAll: (allIds: T[]) => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<T>>>;
  /** @deprecated use exitSelectionMode */
  clearSelection: () => void;
}

/**
 * useSelection - Standardized multi-selection hook with explicit mode and haptics
 */
const DEFAULT_OPTIONS = {};

export function useSelection<T>(
  options: UseSelectionOptions<T> = DEFAULT_OPTIONS as UseSelectionOptions<T>,
): UseSelectionResult<T> {
  const [selectedIds, setSelectedIds] = useState<Set<T>>(new Set());
  const [isSelectionModeActive, setSelectionModeActive] = useState(false);

  const toggleSelection = useCallback(
    (id: T) => {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }

        options.onSelectionChange?.(next);
        return next;
      });
    },
    [options],
  );

  const onLongPressItem = useCallback(
    (id: T) => {
      toggleSelection(id);
      Haptics.selectionAsync();

      if (!isSelectionModeActive) {
        setSelectionModeActive(true);
        options.onEnterSelectionMode?.();
      }
    },
    [isSelectionModeActive, toggleSelection, options],
  );

  const selectAll = useCallback(
    (allIds: T[]) => {
      const next = new Set(allIds);
      setSelectedIds(next);
      setSelectionModeActive(true);
      options.onSelectionChange?.(next);
    },
    [options],
  );

  const clearItems = useCallback(() => {
    const next = new Set<T>();
    setSelectedIds(next);
    options.onSelectionChange?.(next);
  }, [options]);

  const exitSelectionMode = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionModeActive(false);
    options.onExitSelectionMode?.();
    options.onSelectionChange?.(new Set());
  }, [options]);

  return {
    selectedIds,
    isSelectionModeActive,
    toggleSelection,
    onLongPressItem,
    selectAll,
    clearItems,
    exitSelectionMode,
    clearSelection: clearItems,
    setSelectedIds,
  };
}
