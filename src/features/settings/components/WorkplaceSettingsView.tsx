import { EmptyStateView } from '@/src/components/shared/EmptyStateView';
import { WorkplaceEditorModal } from '@/src/components/workplace/WorkplaceEditorModal';
import { Icon, AppIcon, IconButton } from '@/src/components/core';
import { PlainWorkplace } from '@/src/types/plainDtos';
import { Box, Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { WorkplaceSettingsViewModel } from '@/src/features/settings/hooks/useWorkplaceSettingsViewModel';
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
          <SettingsMenu header="Workplace Actions">
            <SettingsMenuItem
              searchId="create-workplace"
              leftIcon={Icon.Plus}
              title="Create Workplace"
              description="Start a new set of books and preferences"
              onPress={vm.startCreateWorkplace}
              prominent
              testID="create-workplace"
            />
          </SettingsMenu>
          {vm.workplaces.length > 0 ? (
            <SettingsMenu header="Available Workplaces">
              {vm.workplaces.map((workplace: PlainWorkplace) => {
                const isActive = vm.activeWorkplace?.id === workplace.id;
                return (
                  <SettingsMenuItem
                    searchId={`workplace-${workplace.id}`}
                    key={workplace.id}
                    title={workplace.name}
                    description={isActive ? 'Current active Workplace' : undefined}
                    onPress={() => {
                      if (!isActive) {
                        vm.setActiveWorkplace(workplace);
                      }
                    }}
                    leftIcon={workplace.icon}
                    rightContent={
                      isActive ? (
                        <AppIcon name={Icon.Check} color={theme.success} size={20} />
                      ) : null
                    }
                    rightAction={
                      <Box flexDirection="row" alignItems="center">
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
                      </Box>
                    }
                    hasArrow={false}
                    style={
                      isActive
                        ? {
                            backgroundColor: withOpacity(theme.primary, Opacity.selection),
                            borderRadius: 12,
                          }
                        : undefined
                    }
                  />
                );
              })}
            </SettingsMenu>
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
