import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { SettingsSegmentedControl } from '@/src/components/settings/SettingsSegmentedControl';
import { Stack } from '@/src/design-system';
import { FontSelectorView } from '@/src/features/settings/components/FontSelectorView';
import { HourCycleSelectorView } from '@/src/features/settings/components/HourCycleSelectorView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenuSection as SettingsMenu } from '@/src/features/settings/components/SettingsMenuSection';
import { SettingsSearchMenuItem } from '@/src/features/settings/components/SettingsSearchMenuItem';
import { SettingsToggleItem } from '@/src/features/settings/components/SettingsToggleItem';
import { ThemeSelectorView } from '@/src/features/settings/components/ThemeSelectorView';
import type { AppearanceSettingsViewModel } from '@/src/features/settings/hooks/useAppearanceSettingsViewModel';
import { AppNavigation } from '@/src/utils/navigation';

interface AppearanceSettingsViewProps {
  vm: AppearanceSettingsViewModel;
}

const MODE_OPTIONS = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const;

export function AppearanceSettingsView({ vm }: AppearanceSettingsViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.appearance}>
      <Stack space="xl">
        <ThemeSelectorView themeId={vm.themeId} setThemeId={vm.setThemeId} />

        <SettingsSegmentedControl
          leftIcon={Icon.Sliders}
          focusId="mode"
          title={AppConfig.strings.settings.appearance.modeTitle}
          description="Choose how the selected theme follows your device."
          options={MODE_OPTIONS}
          value={vm.themePreference}
          onChange={vm.setThemePreference}
        />

        <HourCycleSelectorView
          hourCyclePreference={vm.hourCyclePreference}
          resolvedHourCycle={vm.resolvedHourCycle}
          setHourCyclePreference={vm.setHourCyclePreference}
          focusId="time-format"
        />

        <FontSelectorView fontId={vm.fontId} setFontId={vm.setFontId} />

        <SettingsMenu header={AppConfig.strings.settings.sections.displayOptions}>
          <SettingsToggleItem
            searchId="reduce-motion"
            leftIcon={Icon.Pause}
            title={AppConfig.strings.settings.reduceMotion.title}
            description={AppConfig.strings.settings.reduceMotion.description}
            value={vm.reduceMotion}
            onValueChange={vm.onToggleReduceMotion}
            testID="settings-reduce-motion-toggle"
          />
          <SettingsToggleItem
            searchId="compact-account-picker"
            leftIcon={Icon.Wallet}
            title={AppConfig.strings.settings.accountPicker.title}
            description={AppConfig.strings.settings.accountPicker.description}
            value={vm.useCompactAccountPicker}
            onValueChange={vm.onToggleCompactAccountPicker}
          />
          <SettingsToggleItem
            searchId="account-statistics"
            leftIcon={Icon.BarChart}
            title={AppConfig.strings.settings.stats.title}
            description={AppConfig.strings.settings.stats.description}
            value={vm.showAccountMonthlyStats}
            onValueChange={vm.onToggleAccountMonthlyStats}
          />
          <SettingsToggleItem
            searchId="safe-to-spend-chart"
            leftIcon={Icon.TrendingUp}
            title={AppConfig.strings.settings.stsChart.title}
            description={AppConfig.strings.settings.stsChart.description}
            value={vm.showSafeToSpendChart}
            onValueChange={vm.onToggleSafeToSpendChart}
            testID="settings-sts-chart-toggle"
          />
          <SettingsToggleItem
            searchId="reports-v2-preview"
            leftIcon={Icon.BarChart}
            title={AppConfig.strings.settings.reportsV2.title}
            description={AppConfig.strings.settings.reportsV2.description}
            value={vm.reportsV2Enabled}
            onValueChange={vm.onToggleReportsV2}
            testID="settings-reports-v2-toggle"
          />
          {vm.reportsV2Enabled ? (
            <SettingsSearchMenuItem
              searchId="reports-v2-open"
              leftIcon={Icon.BarChart}
              title={AppConfig.strings.settings.reportsV2.open}
              hasArrow
              onPress={AppNavigation.toReportsV2}
            />
          ) : null}
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}
