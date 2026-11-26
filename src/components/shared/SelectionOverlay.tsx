import {
  SelectionActionBar,
  type SelectionAction,
} from '@/src/components/shared/SelectionActionBar';
import {
  SelectionSummary,
  type SelectionAmountSummary,
  type SelectionItemLabel,
} from '@/src/components/shared/SelectionSummary';
import type { getSelectionState } from '@/src/hooks/selectionState';
import { StyleSheet, View } from 'react-native';

export interface ListSelectionChrome {
  exitSelectionMode: () => void;
  selectAll: () => void;
  clearItems: () => void;
  onShareSelected?: () => void;
  amountSummary?: SelectionAmountSummary;
  actions?: SelectionAction[];
}

export type SelectionOverlayProps = ListSelectionChrome & {
  state: ReturnType<typeof getSelectionState>;
  itemTypeLabel: SelectionItemLabel;
};

export function SelectionHeader({
  state,
  itemTypeLabel,
  amountSummary,
  exitSelectionMode,
  selectAll,
  clearItems,
}: SelectionOverlayProps) {
  return (
    <SelectionSummary
      selection={state}
      amountSummary={amountSummary}
      itemTypeLabel={itemTypeLabel}
      onClear={exitSelectionMode}
      onSelectAll={selectAll}
      onDeselectAll={clearItems}
    />
  );
}

export function SelectionDock({ state, actions, onShareSelected }: SelectionOverlayProps) {
  return (
    <SelectionActionBar
      selectedCount={state.selectedCount}
      actions={actions}
      onShare={onShareSelected}
    />
  );
}

export function SelectionOverlay(props: SelectionOverlayProps) {
  return (
    <View pointerEvents="box-none" style={styles.container}>
      <SelectionHeader {...props} />
      <SelectionDock {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
});
