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
  amountSummary?: SelectionAmountSummary;
  actions?: SelectionAction[];
}

/** Assemble SelectionOverlayProps consistently from selection state and handlers. */
export function buildListSelectionChrome<TId extends string = string>({
  selectedIds,
  selectableIds,
  itemTypeLabel,
  exitSelectionMode,
  selectAll,
  clearItems,
  amountSummary,
  actions,
}: BuildListSelectionChromeParams<TId>): SelectionOverlayProps {
  return {
    state: getSelectionState(selectedIds, selectableIds),
    itemTypeLabel,
    exitSelectionMode,
    selectAll,
    clearItems,
    amountSummary,
    ...(actions !== undefined ? { actions } : {}),
  };
}

/** Attach bulk actions onto an active selection chrome base. */
export function attachSelectionActions(
  chrome: SelectionChromeBase | undefined,
  actions: SelectionAction[] | undefined,
): SelectionOverlayProps | undefined {
  if (!chrome) return undefined;
  return { ...chrome, actions };
}
