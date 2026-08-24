import type { SelectionAction } from '@/src/components/common/SelectionActionBar';
import { useSelectedItemMap } from '@/src/hooks/useSelectedItemMap';
import { useUndoableAction } from '@/src/hooks/useUndoableAction';
import { useCallback, useState } from 'react';
import type { UseSelectionResult } from '@/src/hooks/useSelection';

export interface SelectionActionDefinition<TCount extends number = number> {
  action: SelectionAction;
  isVisible?: (selectedCount: TCount) => boolean;
  isEnabled?: (selectedCount: TCount) => boolean;
}

export interface UseListSelectionInput<
  TItem extends { id: TId },
  TId extends string | number,
  TModal = string | null,
> {
  items: TItem[];
  selection: UseSelectionResult<TId>;
  onCloseModal?: () => void;
  initialModal?: TModal;
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
  initialModal,
}: UseListSelectionInput<TItem, TId, TModal>): UseListSelectionResult<TItem, TId, TModal> {
  const [activeModal, setActiveModal] = useState<TModal>(initialModal ?? (null as TModal));
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
