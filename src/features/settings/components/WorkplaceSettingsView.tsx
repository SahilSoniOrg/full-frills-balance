import { EmptyStateView } from '@/src/components/common/EmptyStateView';
import { AppIcon } from '@/src/components/core';
import { isValidIconName } from '@/src/components/core/AppIcon';
import Workplace from '@/src/data/models/Workplace';
import { Box, Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { WorkplaceSettingsViewModel } from '@/src/features/settings/hooks/useWorkplaceSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { CreateWorkplaceDialog } from './CreateWorkplaceDialog';
import { Opacity } from '@/src/constants/design-tokens';
import { withOpacity } from '@/src/constants';

interface WorkplaceSettingsViewProps {
  vm: WorkplaceSettingsViewModel;
}

export function WorkplaceSettingsView({ vm }: WorkplaceSettingsViewProps) {
  const { theme } = useTheme();

  return (
    <>
      <SettingsLayout
        title="Workplaces"
        headerActions={
          <TouchableOpacity onPress={vm.startCreateWorkplace} style={{ padding: 8 }}>
            <AppIcon name="plus" size={24} color={theme.text} />
          </TouchableOpacity>
        }
      >
        <Stack space="xl">
          {vm.workplaces.length > 0 ? (
            <SettingsMenu header="Available Workplaces">
              {vm.workplaces.map((workplace: Workplace) => {
                const isActive = vm.activeWorkplace?.id === workplace.id;
                return (
                  <SettingsMenuItem
                    key={workplace.id}
                    title={workplace.name}
                    description={isActive ? 'Current active Workplace' : undefined}
                    onPress={() => {
                      if (!isActive) {
                        vm.setActiveWorkplace(workplace);
                      }
                    }}
                    leftIcon={
                      <Box
                        background={isActive ? 'transparent' : 'surfaceSecondary'}
                        backgroundOpacity={isActive ? 'selection' : undefined}
                        borderRadius={isActive ? 'full' : 'r2'}
                        borderWidth={0}
                        padding="xs"
                        alignItems="center"
                        justifyContent="center"
                        style={{ width: 34, height: 34 }}
                      >
                        <AppIcon
                          name={isValidIconName(workplace.icon) ? workplace.icon : 'briefcase'}
                          size={21}
                          color={isActive ? theme.primary : theme.text}
                        />
                      </Box>
                    }
                    rightContent={
                      isActive ? <AppIcon name="check" color="#10B981" size={20} /> : null
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
              icon="briefcase"
              title="No Workplaces"
              subtitle="Create a new workplace to get started."
              primaryActionLabel="Create Workplace"
              onPrimaryAction={vm.startCreateWorkplace}
            />
          )}
        </Stack>
      </SettingsLayout>
      <CreateWorkplaceDialog
        visible={vm.isCreating}
        onClose={vm.cancelCreateWorkplace}
        onCreate={vm.createWorkplace}
        isCreating={vm.isCreatingWorkplace}
      />
    </>
  );
}
