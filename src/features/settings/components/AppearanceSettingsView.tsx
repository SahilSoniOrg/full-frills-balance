import { AppToggle } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { FontSelectorView } from '@/src/features/settings/components/FontSelectorView';
import { HourCycleSelectorView } from '@/src/features/settings/components/HourCycleSelectorView';
import { ModeSelectorView } from '@/src/features/settings/components/ModeSelectorView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { SettingsFocusTarget } from '@/src/features/settings/components/SettingsFocusTarget';
import { ThemeSelectorView } from '@/src/features/settings/components/ThemeSelectorView';
import type { AppearanceSettingsViewModel } from '@/src/features/settings/hooks/useAppearanceSettingsViewModel';

interface AppearanceSettingsViewProps {
  vm: AppearanceSettingsViewModel;
}

export function AppearanceSettingsView({ vm }: AppearanceSettingsViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.appearance}>
      <Stack space="xl">
        <SettingsFocusTarget targetId="appearance">
          <ThemeSelectorView themeId={vm.themeId} setThemeId={vm.setThemeId} />
        </SettingsFocusTarget>

        <SettingsFocusTarget targetId="mode">
          <ModeSelectorView
            themePreference={vm.themePreference}
            setThemePreference={vm.setThemePreference}
          />
        </SettingsFocusTarget>

        <SettingsFocusTarget targetId="time-format">
          <HourCycleSelectorView
            hourCyclePreference={vm.hourCyclePreference}
            resolvedHourCycle={vm.resolvedHourCycle}
            setHourCyclePreference={vm.setHourCyclePreference}
          />
        </SettingsFocusTarget>

        <SettingsFocusTarget targetId="typography">
          <FontSelectorView fontId={vm.fontId} setFontId={vm.setFontId} />
        </SettingsFocusTarget>

        <SettingsMenu header={AppConfig.strings.settings.sections.displayOptions}>
          <SettingsMenuItem
            searchId="compact-account-picker"
            leftIcon="wallet"
            title={AppConfig.strings.settings.accountPicker.title}
            description={AppConfig.strings.settings.accountPicker.description}
            hasArrow={false}
            rightContent={
              <AppToggle
                value={vm.useCompactAccountPicker}
                onValueChange={vm.onToggleCompactAccountPicker}
              />
            }
          />
          <SettingsMenuItem
            searchId="account-statistics"
            leftIcon="barChart"
            title={AppConfig.strings.settings.stats.title}
            description={AppConfig.strings.settings.stats.description}
            hasArrow={false}
            rightContent={
              <AppToggle
                value={vm.showAccountMonthlyStats}
                onValueChange={vm.onToggleAccountMonthlyStats}
              />
            }
          />
          <SettingsMenuItem
            searchId="safe-to-spend-chart"
            leftIcon="trendingUp"
            title={AppConfig.strings.settings.stsChart.title}
            description={AppConfig.strings.settings.stsChart.description}
            hasArrow={false}
            rightContent={
              <AppToggle
                value={vm.showSafeToSpendChart}
                onValueChange={vm.onToggleSafeToSpendChart}
              />
            }
            testID="settings-sts-chart-toggle"
          />
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}
