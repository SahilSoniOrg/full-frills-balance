import type { ScreenNavChrome } from '@/src/components/layout';
import { AppToggle } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { FontSelectorView } from '@/src/features/settings/components/FontSelectorView';
import { ModeSelectorView } from '@/src/features/settings/components/ModeSelectorView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { ThemeSelectorView } from '@/src/features/settings/components/ThemeSelectorView';
import type { AppearanceSettingsViewModel } from '@/src/features/settings/hooks/useAppearanceSettingsViewModel';

interface AppearanceSettingsViewProps {
  chrome: ScreenNavChrome;
  vm: AppearanceSettingsViewModel;
}

export function AppearanceSettingsView({ vm, chrome }: AppearanceSettingsViewProps) {
  return (
    <SettingsLayout chrome={chrome}>
      <Stack space="xl">
        <ThemeSelectorView themeId={vm.themeId} setThemeId={vm.setThemeId} />

        <ModeSelectorView
          themePreference={vm.themePreference}
          setThemePreference={vm.setThemePreference}
        />

        <FontSelectorView fontId={vm.fontId} setFontId={vm.setFontId} />

        <SettingsMenu header={AppConfig.strings.settings.sections.displayOptions}>
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
