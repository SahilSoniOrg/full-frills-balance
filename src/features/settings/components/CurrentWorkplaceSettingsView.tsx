import { WorkplaceEditorModal } from '@/src/components/workplace/WorkplaceEditorModal';
import { AppIcon } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';
import { CurrencyPreferenceView } from '@/src/features/settings/components/CurrencyPreferenceView';
import { SafeToSpendPreferenceView } from '@/src/features/settings/components/SafeToSpendPreferenceView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { SettingsFocusTarget } from '@/src/features/settings/components/SettingsFocusTarget';
import type { CurrentWorkplaceSettingsViewModel } from '@/src/features/settings/hooks/useCurrentWorkplaceSettingsViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import { isValidIconName } from '@/src/types/domainIcons';
import { useState } from 'react';

interface CurrentWorkplaceSettingsViewProps {
  vm: CurrentWorkplaceSettingsViewModel;
}

export function CurrentWorkplaceSettingsView({ vm }: CurrentWorkplaceSettingsViewProps) {
  const [isEditorVisible, setIsEditorVisible] = useState(false);

  return (
    <>
      <SettingsLayout title={AppConfig.strings.settings.sections.currentWorkplace}>
        <Stack space="xl">
          <SettingsMenu header="Current Workplace">
            <SettingsMenuItem
              searchId="workplace"
              leftIcon={
                <Box
                  background="surfaceSecondary"
                  borderRadius="full"
                  width={34}
                  height={34}
                  alignItems="center"
                  justifyContent="center"
                >
                  <AppIcon
                    name={
                      vm.activeWorkplace && isValidIconName(vm.activeWorkplace.icon)
                        ? vm.activeWorkplace.icon
                        : 'briefcase'
                    }
                    size={21}
                    color="primary"
                  />
                </Box>
              }
              title={vm.activeWorkplace?.name || 'Current workplace'}
              description="Rename this workplace or change its icon"
              onPress={() => setIsEditorVisible(true)}
              testID="current-workplace-edit"
            />
          </SettingsMenu>

          <SettingsMenu header="Workplace">
            <SettingsMenuItem
              searchId="manage-workplaces"
              leftIcon="briefcase"
              title="Manage workplaces"
              description="Switch, create, or delete workplaces"
              onPress={AppNavigation.toWorkplaceSettings}
              testID="current-workplace-workplaces"
            />
          </SettingsMenu>

          <SettingsMenu header={AppConfig.strings.settings.sections.moneyDefaults}>
            <CurrencyPreferenceView
              selectedCurrency={vm.workplaceCurrency}
              currencies={vm.currencies}
              workplaceName={vm.workplaceName}
              onSelect={vm.onUpdateCurrency}
            />
          </SettingsMenu>

          <SettingsFocusTarget targetId="safe-to-spend-forecast">
            <SettingsMenu header={AppConfig.strings.settings.sections.forecasting}>
              <SafeToSpendPreferenceView
                days={vm.safeToSpendDays}
                workplaceName={vm.workplaceName}
                onChange={vm.setSafeToSpendDays}
              />
            </SettingsMenu>
          </SettingsFocusTarget>
        </Stack>
      </SettingsLayout>
      {vm.activeWorkplace && (
        <WorkplaceEditorModal
          key={`${vm.activeWorkplace.id}:${vm.activeWorkplace.name}:${vm.activeWorkplace.icon}`}
          visible={isEditorVisible}
          name={vm.activeWorkplace.name}
          icon={isValidIconName(vm.activeWorkplace.icon) ? vm.activeWorkplace.icon : 'briefcase'}
          onClose={() => setIsEditorVisible(false)}
          onSave={async (name, icon) => {
            if (await vm.updateWorkplaceDetails(name, icon)) {
              setIsEditorVisible(false);
            }
          }}
        />
      )}
    </>
  );
}
