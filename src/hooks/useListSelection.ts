import type { SelectionAction } from '@/src/components/shared/SelectionActionBar';
import { useUndoableAction } from '@/src/hooks/useUndoableAction';
import { useCallback, useMemo, useState } from 'react';
import type { UseSelectionResult } from '@/src/hooks/useSelection';

export interface SelectionActionDefinition<TCount extends number = number> {
  action: SelectionAction;
  isVisible?: (selectedCount: TCount) => boolean;
  isEnabled?: (selectedCount: TCount) => boolean;
}

export interface UseListSelectionInput<TItem extends { id: TId }, TId extends string | number> {
  items: TItem[];
  selection: UseSelectionResult<TId>;
  onCloseModal?: () => void;
}

/**
 * Pure selection-derived data: an id→item index plus the currently-selected
 * subset, all derived from `items` and a `useSelection` result.
 *
 * `TItem` must expose a stable `id` of type `TId` — this is why the hook takes
 * no `getId` accessor. Deriving the key from `item.id` directly (rather than a
 * caller-supplied function) is what keeps `itemsById` referentially stable: a
 * per-render `getId` arrow would otherwise defeat the memo.
 */
export function useSelectedItemMap<TItem extends { id: TId }, TId extends string | number>(
  items: TItem[],
  selection: UseSelectionResult<TId>,
) {
  const itemsById = useMemo(
    () => new Map(items.map(item => [item.id, item] as [TId, TItem])),
    [items],
  );

  const selectedItems = useMemo(
    () =>
      Array.from(selection.selectedIds)
        .map(id => itemsById.get(id))
        .filter((item): item is TItem => item !== undefined),
    [selection.selectedIds, itemsById],
  );

  return { itemsById, selectedItems };
}

export function buildListSelectionActions(
  definitions: SelectionActionDefinition<number>[],
  selectedCount: number,
): SelectionAction[] {
  return definitions
    .filter(({ isVisible }) => isVisible?.(selectedCount) ?? true)
    .map(({ action, isEnabled }) => ({
      ...action,
      disabled: action.disabled ?? !(isEnabled?.(selectedCount) ?? true),
    }));
}

export interface UseListSelectionResult<TItem, TId extends string | number, TModal> {
  itemsById: Map<TId, TItem>;
  selectedItems: TItem[];
  activeModal: TModal;
  openModal: (modal: Exclude<TModal, null>) => void;
  closeModal: () => void;
  runUndoableAction: ReturnType<typeof useUndoableAction>;
  buildActions: (definitions: SelectionActionDefinition<number>[]) => SelectionAction[];
}

export function useListSelection<
  TItem extends { id: TId },
  TId extends string | number,
  TModal = string | null,
>({
  items,
  selection,
  onCloseModal,
}: UseListSelectionInput<TItem, TId>): UseListSelectionResult<TItem, TId, TModal> {
  const [activeModal, setActiveModal] = useState<TModal>(null as TModal);
  const { itemsById, selectedItems } = useSelectedItemMap(items, selection);
  const closeModal = useCallback(() => {
    setActiveModal(null as TModal);
    onCloseModal?.();
  }, [onCloseModal]);
  const openModal = useCallback(
    (modal: Exclude<TModal, null>) => setActiveModal(modal as TModal),
    [],
  );
  const runUndoableAction = useUndoableAction(selection.exitSelectionMode, closeModal);
  const buildActions = useCallback(
    (definitions: SelectionActionDefinition<number>[]) =>
      buildListSelectionActions(definitions, selection.selectedIds.size),
    [selection.selectedIds.size],
  );

  return {
    itemsById,
    selectedItems,
    activeModal,
    openModal,
    closeModal,
    runUndoableAction,
    buildActions,
  };
}
