import { ListGroup, ListRow, Icon, AppIcon, IconButton } from '@/src/components/core';
import { EmptyStateView } from '@/src/components/shared/EmptyStateView';
import { WorkplaceEditorModal } from '@/src/components/workplace/WorkplaceEditorModal';
import { PlainWorkplace } from '@/src/types/plainDtos';
import { Box, Inline, Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import {
  useWorkplaceSettingsViewModel,
  WorkplaceSettingsViewModel,
} from '@/src/features/settings/hooks/useWorkplaceSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { Opacity } from '@/src/constants/design-tokens';
import { withOpacity } from '@/src/utils/color-math';
import { useState } from 'react';
import type { ReactNode } from 'react';

interface WorkplaceSettingsViewProps {
  vm: WorkplaceSettingsViewModel;
  headerActions?: ReactNode;
}

export function WorkplaceSettingsView({ vm, headerActions }: WorkplaceSettingsViewProps) {
  const { theme } = useTheme();
  const [editingWorkplace, setEditingWorkplace] = useState<PlainWorkplace | null>(null);

  return (
    <>
      <SettingsLayout title="Workplaces" headerActions={headerActions}>
        <Stack space="xl">
          <ListGroup variant="plain" header="Workplace Actions">
            <ListRow
              focusId="create-workplace"
              icon={Icon.Plus}
              title="Create Workplace"
              subtitle="Start a new set of books and preferences"
              onPress={vm.startCreateWorkplace}
              testID="create-workplace"
            />
          </ListGroup>
          {vm.workplaces.length > 0 ? (
            <ListGroup variant="plain" header="Available Workplaces">
              {vm.workplaces.map((workplace: PlainWorkplace) => {
                const isActive = vm.activeWorkplace?.id === workplace.id;
                return (
                  <Inline
                    key={workplace.id}
                    align="center"
                    style={
                      isActive
                        ? {
                            backgroundColor: withOpacity(theme.primary, Opacity.selection),
                            borderRadius: 12,
                          }
                        : undefined
                    }
                  >
                    <Box flex={1}>
                      <ListRow
                        focusId={`workplace-${workplace.id}`}
                        title={workplace.name}
                        subtitle={isActive ? 'Current active Workplace' : undefined}
                        onPress={() => {
                          if (!isActive) vm.setActiveWorkplace(workplace);
                        }}
                        icon={workplace.icon}
                        trailing={
                          isActive ? (
                            <AppIcon name={Icon.Check} color={theme.success} size={20} />
                          ) : null
                        }
                        chevron={false}
                      />
                    </Box>
                    <IconButton
                      name={Icon.Edit}
                      variant="clear"
                      accessibilityLabel={`Edit ${workplace.name}`}
                      testID={`workplace-edit-${workplace.id}`}
                      onPress={() => setEditingWorkplace(workplace)}
                    />
                    <IconButton
                      name={Icon.Delete}
                      variant="clear"
                      iconColor={theme.error}
                      accessibilityLabel={`Delete ${workplace.name}`}
                      testID={`workplace-delete-${workplace.id}`}
                      disabled={vm.deletingWorkplaceId !== null}
                      onPress={() => vm.deleteWorkplace(workplace)}
                    />
                  </Inline>
                );
              })}
            </ListGroup>
          ) : (
            <EmptyStateView
              icon={Icon.Briefcase}
              title="No workplaces found"
              subtitle="Create a new workspace to get started."
              primaryActionLabel="Create Workspace"
              onPrimaryAction={vm.startCreateWorkplace}
            />
          )}
        </Stack>
      </SettingsLayout>
      {editingWorkplace && (
        <WorkplaceEditorModal
          key={`${editingWorkplace.id}:${editingWorkplace.name}:${editingWorkplace.icon}`}
          visible
          name={editingWorkplace.name}
          icon={editingWorkplace.icon}
          onClose={() => setEditingWorkplace(null)}
          onSave={async (name, icon) => {
            await vm.updateWorkplaceDetails(editingWorkplace, name, icon);
            setEditingWorkplace(null);
          }}
        />
      )}
    </>
  );
}

export default function WorkplaceSettingsScreen() {
  const vm = useWorkplaceSettingsViewModel();
  return <WorkplaceSettingsView vm={vm} />;
}
