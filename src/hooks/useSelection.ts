import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { useNavigation } from 'expo-router';

export interface UseSelectionResult<T> {
  selectedIds: Set<T>;
  isSelectionModeActive: boolean;
  toggleSelection: (id: T) => void;
  toggleMultiple: (ids: T[]) => void;
  onLongPressItem: (id: T) => void;
  selectAll: (allIds: T[]) => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<T>>>;
}

/**
 * useSelection - Standardized multi-selection hook with explicit mode and haptics
 */
export function useSelection<T>(): UseSelectionResult<T> {
  const [selectedIds, setSelectedIds] = useState<Set<T>>(new Set());
  const [isSelectionModeActive, setSelectionModeActive] = useState(false);

  const toggleSelection = useCallback((id: T) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  const toggleMultiple = useCallback(
    (ids: T[]) => {
      if (ids.length === 0) return;
      void Haptics.selectionAsync();

      setSelectedIds(prev => {
        const next = new Set(prev);
        const allSelected = ids.every(id => prev.has(id));

        if (allSelected) {
          for (const id of ids) {
            next.delete(id);
          }
        } else {
          for (const id of ids) {
            next.add(id);
          }
        }

        return next;
      });

      if (!isSelectionModeActive) {
        setSelectionModeActive(true);
      }
    },
    [isSelectionModeActive],
  );

  const onLongPressItem = useCallback(
    (id: T) => {
      toggleSelection(id);
      void Haptics.selectionAsync();

      if (!isSelectionModeActive) {
        setSelectionModeActive(true);
      }
    },
    [isSelectionModeActive, toggleSelection],
  );

  const selectAll = useCallback((allIds: T[]) => {
    const next = new Set(allIds);
    setSelectedIds(next);
    setSelectionModeActive(true);
  }, []);

  const clearItems = useCallback(() => {
    const next = new Set<T>();
    setSelectedIds(next);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionModeActive(false);
  }, []);

  const navigation = useNavigation();

  useEffect(() => {
    if (!isSelectionModeActive) return;

    const backAction = () => {
      const isFocused = navigation ? navigation.isFocused() : true;
      if (isSelectionModeActive && isFocused) {
        exitSelectionMode();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isSelectionModeActive, exitSelectionMode, navigation]);

  return {
    selectedIds,
    isSelectionModeActive,
    toggleSelection,
    toggleMultiple,
    onLongPressItem,
    selectAll,
    clearItems,
    exitSelectionMode,
    setSelectedIds,
  };
}
