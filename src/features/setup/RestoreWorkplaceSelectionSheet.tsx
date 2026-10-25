import { AppButton, AppText, ListGroup, ListRow } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { SelectionIndicator } from '@/src/components/shared/SelectionIndicator';
import { Size, Spacing } from '@/src/constants';
import { Stack } from '@/src/design-system';

export interface RestoreWorkplaceCandidate {
  readonly name: string;
  readonly currency: string;
  readonly accounts?: number;
  readonly categories?: number;
  readonly journals?: number;
}

function workplaceSubtitle(entry: RestoreWorkplaceCandidate) {
  const parts: string[] = [];
  if (entry.currency) parts.push(entry.currency);
  if (entry.accounts !== undefined) {
    parts.push(
      `${entry.accounts} accounts · ${entry.categories ?? 0} categories · ${entry.journals ?? 0} journals`,
    );
  }
  return parts.join('\n') || undefined;
}

export function RestoreWorkplaceSelectionSheet({
  visible,
  workplaces,
  selectedIndexes,
  onChange,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  workplaces: readonly RestoreWorkplaceCandidate[];
  selectedIndexes: readonly number[];
  onChange: (indexes: readonly number[]) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const allSelected = selectedIndexes.length === workplaces.length;
  const selectAllState = allSelected ? true : selectedIndexes.length > 0 ? 'mixed' : false;

  return (
    <ModalSurface
      visible={visible}
      title="Restore workplaces"
      onClose={onClose}
      position="bottomSheet"
      fixedHeight={false}
      maxHeightPercent={82}
      accessibilityCloseLabel="Close restore workplace selection"
    >
      <Stack gap="sm">
        <AppText variant="caption" color="secondary">
          Choose which validated workplaces to save. Unselected workplaces will be discarded.
        </AppText>
        <ListGroup variant="plain" dividerInset="none">
          <ListRow
            title="Select all"
            leading={<SelectionIndicator selected={selectAllState} size={Size.iconSm} />}
            chevron={false}
            onPress={() => onChange(allSelected ? [] : workplaces.map((_, index) => index))}
            accessibilityRole="checkbox"
            accessibilityLabel="Select all workplaces"
            accessibilityState={{ checked: selectAllState }}
          />
          {workplaces.map((entry, index) => {
            const selected = selectedIndexes.includes(index);
            return (
              <ListRow
                key={`${entry.name}-${index}`}
                title={entry.name}
                subtitle={workplaceSubtitle(entry)}
                wrap
                leading={<SelectionIndicator selected={selected} size={Size.iconSm} />}
                chevron={false}
                onPress={() =>
                  onChange(
                    selected
                      ? selectedIndexes.filter(item => item !== index)
                      : [...selectedIndexes, index],
                  )
                }
                accessibilityRole="checkbox"
                accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${entry.name}`}
                accessibilityState={{ checked: selected }}
                testID={`restore-workplace-option-${index}`}
              />
            );
          })}
        </ListGroup>
        <AppButton
          variant={selectedIndexes.length === 0 ? 'destructive' : 'primary'}
          onPress={onConfirm}
          style={{ marginTop: Spacing.md }}
          testID="restore-selected-workplaces"
        >
          {selectedIndexes.length === 0
            ? 'Discard all'
            : `Save ${selectedIndexes.length} workplace${selectedIndexes.length === 1 ? '' : 's'}`}
        </AppButton>
      </Stack>
    </ModalSurface>
  );
}
