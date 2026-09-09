import { Icon, AppButton, AppIcon, AppText } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Box, Stack } from '@/src/design-system';
import { Size, Spacing } from '@/src/constants';
import type { BackupScope } from '@/src/services/export';
import type { PlainWorkplace } from '@/src/types/plainDtos';
import { TouchableOpacity } from 'react-native';

export function BackupScopeSheet({
  visible,
  workplaces,
  activeWorkplaceId,
  scope,
  selectedWorkplaceIds,
  onScopeChange,
  onSelectedWorkplaceIdsChange,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  workplaces: PlainWorkplace[];
  activeWorkplaceId: string;
  scope: BackupScope;
  selectedWorkplaceIds: string[];
  onScopeChange: (scope: BackupScope) => void;
  onSelectedWorkplaceIdsChange: (ids: string[]) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const options: { scope: BackupScope; title: string; description: string }[] = [
    {
      scope: 'active',
      title: 'This workplace',
      description:
        workplaces.find(item => item.id === activeWorkplaceId)?.name ?? 'Active workplace',
    },
    { scope: 'all', title: 'All workplaces', description: `${workplaces.length} workplaces` },
    { scope: 'selected', title: 'Choose workplaces', description: 'Select one or more workplaces' },
  ];

  return (
    <ModalSurface
      visible={visible}
      title="Backup scope"
      onClose={onClose}
      position="bottomSheet"
      fixedHeight={false}
      maxHeightPercent={82}
      accessibilityCloseLabel="Close backup scope"
    >
      <Stack gap="sm">
        {options.map(option => (
          <TouchableOpacity
            key={option.scope}
            onPress={() => onScopeChange(option.scope)}
            accessibilityRole="radio"
            accessibilityState={{ selected: scope === option.scope }}
          >
            <Box
              flexDirection="row"
              alignItems="center"
              padding="md"
              borderRadius="r2"
              background={scope === option.scope ? 'primary' : 'surfaceSecondary'}
              backgroundOpacity={scope === option.scope ? 'selection' : undefined}
              gap="md"
            >
              <Stack gap="xs" flex={1}>
                <AppText weight="semibold">{option.title}</AppText>
                <AppText variant="caption" color="secondary">
                  {option.description}
                </AppText>
              </Stack>
              {scope === option.scope && (
                <AppIcon name={Icon.CheckCircle} size={Size.iconSm} color="primary" />
              )}
            </Box>
          </TouchableOpacity>
        ))}

        {scope === 'selected' && (
          <Stack gap="xs" style={{ marginTop: Spacing.sm }}>
            {workplaces.map(workplace => {
              const selected = selectedWorkplaceIds.includes(workplace.id);
              return (
                <TouchableOpacity
                  key={workplace.id}
                  onPress={() =>
                    onSelectedWorkplaceIdsChange(
                      selected
                        ? selectedWorkplaceIds.filter(id => id !== workplace.id)
                        : [...selectedWorkplaceIds, workplace.id],
                    )
                  }
                >
                  <Box flexDirection="row" alignItems="center" padding="sm" gap="md">
                    <AppIcon
                      name={selected ? Icon.CheckSquare : Icon.Square}
                      size={Size.iconSm}
                      color={selected ? 'primary' : 'secondary'}
                    />
                    <AppText>{workplace.name}</AppText>
                  </Box>
                </TouchableOpacity>
              );
            })}
          </Stack>
        )}

        <AppButton
          onPress={onConfirm}
          disabled={scope === 'selected' && selectedWorkplaceIds.length === 0}
          style={{ marginTop: Spacing.md }}
        >
          Export backup
        </AppButton>
      </Stack>
    </ModalSurface>
  );
}
