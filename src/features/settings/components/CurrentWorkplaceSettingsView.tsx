import { Icon } from '@/src/types/domainIcons';
import { WorkplaceEditorModal } from '@/src/components/workplace/WorkplaceEditorModal';
import { SettingsSegmentedControl } from '@/src/components/settings/SettingsSegmentedControl';
import { AppConfig, Opacity, withOpacity } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { CurrencySelector } from '@/src/features/accounts';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import type { CurrentWorkplaceSettingsViewModel } from '@/src/features/settings/hooks/useCurrentWorkplaceSettingsViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';

interface CurrentWorkplaceSettingsViewProps {
  vm: CurrentWorkplaceSettingsViewModel;
}

const SAFE_TO_SPEND_OPTIONS = [
  { id: 30, label: '30 Days' },
  { id: 60, label: '60 Days' },
  { id: 90, label: '90 Days' },
] as const;

export function CurrentWorkplaceSettingsView({ vm }: CurrentWorkplaceSettingsViewProps) {
  const { theme } = useTheme();
  const [isEditorVisible, setIsEditorVisible] = useState(false);

  return (
    <>
      <SettingsLayout title={AppConfig.strings.settings.sections.currentWorkplace}>
        <Stack space="xl">
          <SettingsMenu header="Current Workplace">
            <SettingsMenuItem
              searchId="workplace"
              leftIcon={vm.activeWorkplace?.icon ?? Icon.Briefcase}
              title={vm.activeWorkplace?.name || 'Current workplace'}
              description="Rename this workplace or change its icon"
              onPress={() => setIsEditorVisible(true)}
              testID="current-workplace-edit"
            />
          </SettingsMenu>

          <SettingsMenu header="Workplace">
            <SettingsMenuItem
              searchId="manage-workplaces"
              leftIcon={Icon.Briefcase}
              title="Manage workplaces"
              description="Switch, create, or delete workplaces"
              onPress={AppNavigation.toWorkplaceSettings}
              testID="current-workplace-workplaces"
            />
          </SettingsMenu>

          <SettingsMenu header={AppConfig.strings.settings.sections.moneyDefaults}>
            <SettingsMenuItem
              searchId="currency"
              leftIcon={Icon.Bank}
              title={AppConfig.strings.settings.currency.title}
              description={`${AppConfig.strings.settings.currency.description} for ${vm.workplaceName || 'current workplace'}`}
              hasArrow={false}
              rightContent={
                <CurrencySelector
                  selectedCurrency={vm.workplaceCurrency}
                  currencies={vm.currencies}
                  onSelect={vm.onUpdateCurrency}
                  variant="pill"
                  title={AppConfig.strings.settings.currency.selectTitle}
                  selectedBackgroundColor={withOpacity(theme.primary, Opacity.soft / 2)}
                />
              }
            />
          </SettingsMenu>

          <SettingsMenu header={AppConfig.strings.settings.sections.forecasting}>
            <SettingsSegmentedControl
              leftIcon={Icon.TrendingUp}
              focusId="safe-to-spend-forecast"
              title={AppConfig.strings.settings.personalization.forecastTitle}
              description={AppConfig.strings.settings.personalization.forecastDesc}
              options={SAFE_TO_SPEND_OPTIONS}
              value={vm.safeToSpendDays}
              onChange={vm.setSafeToSpendDays}
              controlTestID="safe-to-spend-horizon"
            />
          </SettingsMenu>
        </Stack>
      </SettingsLayout>
      {vm.activeWorkplace && (
        <WorkplaceEditorModal
          key={`${vm.activeWorkplace.id}:${vm.activeWorkplace.name}:${vm.activeWorkplace.icon}`}
          visible={isEditorVisible}
          name={vm.activeWorkplace.name}
          icon={vm.activeWorkplace.icon}
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
