import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Box, Stack } from '@/src/design-system';
import { Size, Spacing } from '@/src/constants';
import { TouchableOpacity } from 'react-native';
import { useTheme } from '@/src/hooks/use-theme';

export interface RestoreWorkplaceCandidate {
  readonly name: string;
  readonly currency: string;
  readonly accounts?: number;
  readonly categories?: number;
  readonly journals?: number;
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
  const { theme } = useTheme();
  const allSelected = selectedIndexes.length === workplaces.length;
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
        <TouchableOpacity
          onPress={() => onChange(allSelected ? [] : workplaces.map((_, index) => index))}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allSelected }}
        >
          <Box flexDirection="row" alignItems="center" padding="sm" gap="md">
            <AppIcon
              name={allSelected ? 'checkSquare' : 'square'}
              size={Size.iconSm}
              color={allSelected ? theme.primary : theme.textSecondary}
            />
            <AppText weight="semibold">Select all</AppText>
          </Box>
        </TouchableOpacity>
        <Stack gap="xs" style={{ marginTop: Spacing.xs }}>
          {workplaces.map((entry, index) => {
            const selected = selectedIndexes.includes(index);
            return (
              <TouchableOpacity
                key={`${entry.name}-${index}`}
                onPress={() =>
                  onChange(
                    selected
                      ? selectedIndexes.filter(item => item !== index)
                      : [...selectedIndexes, index],
                  )
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                testID={`restore-workplace-option-${index}`}
              >
                <Box flexDirection="row" alignItems="center" padding="sm" gap="md">
                  <AppIcon
                    name={selected ? 'checkSquare' : 'square'}
                    size={Size.iconSm}
                    color={selected ? theme.primary : theme.textSecondary}
                  />
                  <Stack gap="xs" flex={1}>
                    <AppText>{entry.name}</AppText>
                    {entry.currency ? (
                      <AppText variant="caption" color="secondary">
                        {entry.currency}
                      </AppText>
                    ) : null}
                    {entry.accounts !== undefined ? (
                      <AppText variant="caption" color="secondary">
                        {entry.accounts} accounts · {entry.categories ?? 0} categories ·{' '}
                        {entry.journals ?? 0} journals
                      </AppText>
                    ) : null}
                  </Stack>
                </Box>
              </TouchableOpacity>
            );
          })}
        </Stack>
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
