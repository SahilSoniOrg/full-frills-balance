import type { SelectionAction } from '@/src/components/shared/SelectionActionBar';
import type { SelectionOverlayProps } from '@/src/components/shared/SelectionOverlay';
import type {
  SelectionAmountSummary,
  SelectionItemLabel,
} from '@/src/components/shared/SelectionSummary';
import { getSelectionState } from '@/src/hooks/selectionState';

export type SelectionChromeBase = Omit<SelectionOverlayProps, 'actions'>;

export interface BuildListSelectionChromeParams<TId extends string = string> {
  selectedIds: ReadonlySet<TId>;
  selectableIds: readonly TId[];
  itemTypeLabel: SelectionItemLabel;
  exitSelectionMode: () => void;
  selectAll: () => void;
  clearItems: () => void;
  onShareSelected?: () => void;
  amountSummary?: SelectionAmountSummary;
  actions?: SelectionAction[];
}

/** Merge bulk actions onto a base selection chrome object when selection is active. */
export function attachSelectionActions(
  chrome: SelectionChromeBase | undefined,
  actions: SelectionAction[] | undefined,
): SelectionOverlayProps | undefined {
  if (!chrome) return undefined;
  return { ...chrome, actions };
}

/** Assemble SelectionOverlayProps consistently from selection state and handlers. */
export function buildListSelectionChrome<TId extends string = string>({
  selectedIds,
  selectableIds,
  itemTypeLabel,
  exitSelectionMode,
  selectAll,
  clearItems,
  onShareSelected,
  amountSummary,
  actions,
}: BuildListSelectionChromeParams<TId>): SelectionOverlayProps {
  return {
    state: getSelectionState(selectedIds, selectableIds),
    itemTypeLabel,
    exitSelectionMode,
    selectAll,
    clearItems,
    onShareSelected,
    amountSummary,
    ...(actions !== undefined ? { actions } : {}),
  };
}
