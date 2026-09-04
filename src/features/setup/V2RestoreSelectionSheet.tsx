import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Box, Stack } from '@/src/design-system';
import { Size, Spacing } from '@/src/constants';
import type { V2Backup } from './pickRestoreSource';
import { TouchableOpacity } from 'react-native';

type WorkplaceEntry = NonNullable<V2Backup['workplaces']>[number];

export function V2RestoreSelectionSheet({
  visible,
  workplaces,
  selectedIndexes,
  onChange,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  workplaces: WorkplaceEntry[];
  selectedIndexes: number[];
  onChange: (indexes: number[]) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
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
          Choose which workplaces to restore from this backup.
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
              color={allSelected ? 'primary' : 'secondary'}
            />
            <AppText weight="semibold">Select all</AppText>
          </Box>
        </TouchableOpacity>
        <Stack gap="xs" style={{ marginTop: Spacing.xs }}>
          {workplaces.map((entry, index) => {
            const selected = selectedIndexes.includes(index);
            const workplace = entry.workplace;
            const name =
              typeof workplace === 'object' && workplace !== null && 'name' in workplace
                ? String((workplace as { name?: unknown }).name ?? `Workplace ${index + 1}`)
                : `Workplace ${index + 1}`;
            const currency =
              typeof workplace === 'object' &&
              workplace !== null &&
              'defaultCurrencyCode' in workplace
                ? String((workplace as { defaultCurrencyCode?: unknown }).defaultCurrencyCode ?? '')
                : '';
            return (
              <TouchableOpacity
                key={`${name}-${index}`}
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
                    color={selected ? 'primary' : 'secondary'}
                  />
                  <Stack gap="xs" flex={1}>
                    <AppText>{name}</AppText>
                    {currency ? (
                      <AppText variant="caption" color="secondary">
                        {currency}
                      </AppText>
                    ) : null}
                  </Stack>
                </Box>
              </TouchableOpacity>
            );
          })}
        </Stack>
        <AppButton
          onPress={onConfirm}
          disabled={selectedIndexes.length === 0}
          style={{ marginTop: Spacing.md }}
          testID="restore-selected-workplaces"
        >
          Restore {selectedIndexes.length} workplace{selectedIndexes.length === 1 ? '' : 's'}
        </AppButton>
      </Stack>
    </ModalSurface>
  );
}
