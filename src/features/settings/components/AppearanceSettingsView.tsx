import { AppToggle } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { FontSelectorView } from '@/src/features/settings/components/FontSelectorView';
import { HourCycleSelectorView } from '@/src/features/settings/components/HourCycleSelectorView';
import { ModeSelectorView } from '@/src/features/settings/components/ModeSelectorView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { ThemeSelectorView } from '@/src/features/settings/components/ThemeSelectorView';
import type { AppearanceSettingsViewModel } from '@/src/features/settings/hooks/useAppearanceSettingsViewModel';

interface AppearanceSettingsViewProps {
  vm: AppearanceSettingsViewModel;
}

export function AppearanceSettingsView({ vm }: AppearanceSettingsViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.appearance}>
      <Stack space="xl">
        <ThemeSelectorView themeId={vm.themeId} setThemeId={vm.setThemeId} />

        <ModeSelectorView
          themePreference={vm.themePreference}
          setThemePreference={vm.setThemePreference}
        />

        <HourCycleSelectorView
          hourCyclePreference={vm.hourCyclePreference}
          resolvedHourCycle={vm.resolvedHourCycle}
          setHourCyclePreference={vm.setHourCyclePreference}
        />

        <FontSelectorView fontId={vm.fontId} setFontId={vm.setFontId} />

        <SettingsMenu header={AppConfig.strings.settings.sections.displayOptions}>
          <SettingsMenuItem
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
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}
