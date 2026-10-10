import { AppSegmentedControl, ListGroup, ListRow } from '@/src/components/core';
import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { FontSelectorView } from '@/src/features/settings/components/FontSelectorView';
import { HourCycleSelectorView } from '@/src/features/settings/components/HourCycleSelectorView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { ThemeSelectorView } from '@/src/features/settings/components/ThemeSelectorView';
import {
  useAppearanceSettingsViewModel,
  type AppearanceSettingsViewModel,
} from '@/src/features/settings/hooks/useAppearanceSettingsViewModel';

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

        <ListGroup variant="plain">
          <ListRow
            icon={Icon.Sliders}
            focusId="mode"
            title={AppConfig.strings.settings.appearance.modeTitle}
            subtitle="Choose how the selected theme follows your device."
          >
            <AppSegmentedControl
              options={MODE_OPTIONS}
              value={vm.themePreference}
              onChange={vm.setThemePreference}
              flex
              size="md"
            />
          </ListRow>
        </ListGroup>

        <HourCycleSelectorView
          hourCyclePreference={vm.hourCyclePreference}
          resolvedHourCycle={vm.resolvedHourCycle}
          setHourCyclePreference={vm.setHourCyclePreference}
          focusId="time-format"
        />

        <FontSelectorView fontId={vm.fontId} setFontId={vm.setFontId} />

        <ListGroup variant="plain" header={AppConfig.strings.settings.sections.displayOptions}>
          <ListRow
            focusId="reduce-motion"
            icon={Icon.Pause}
            title={AppConfig.strings.settings.reduceMotion.title}
            subtitle={AppConfig.strings.settings.reduceMotion.description}
            testID="settings-reduce-motion-toggle"
            trailing={
              <ListRow.Toggle value={vm.reduceMotion} onValueChange={vm.onToggleReduceMotion} />
            }
          />
          <ListRow
            focusId="compact-account-picker"
            icon={Icon.Wallet}
            title={AppConfig.strings.settings.accountPicker.title}
            subtitle={AppConfig.strings.settings.accountPicker.description}
            trailing={
              <ListRow.Toggle
                value={vm.useCompactAccountPicker}
                onValueChange={vm.onToggleCompactAccountPicker}
              />
            }
          />
          <ListRow
            focusId="account-statistics"
            icon={Icon.BarChart}
            title={AppConfig.strings.settings.stats.title}
            subtitle={AppConfig.strings.settings.stats.description}
            trailing={
              <ListRow.Toggle
                value={vm.showAccountMonthlyStats}
                onValueChange={vm.onToggleAccountMonthlyStats}
              />
            }
          />
          <ListRow
            focusId="safe-to-spend-chart"
            icon={Icon.TrendingUp}
            title={AppConfig.strings.settings.stsChart.title}
            subtitle={AppConfig.strings.settings.stsChart.description}
            testID="settings-sts-chart-toggle"
            trailing={
              <ListRow.Toggle
                value={vm.showSafeToSpendChart}
                onValueChange={vm.onToggleSafeToSpendChart}
              />
            }
          />
        </ListGroup>
      </Stack>
    </SettingsLayout>
  );
}

export default function AppearanceSettingsScreen() {
  const vm = useAppearanceSettingsViewModel();
  return <AppearanceSettingsView vm={vm} />;
}
