import { Screen } from '@/src/components/layout';
import { AppConfig, Spacing } from '@/src/constants';
import { FontSelector } from '@/src/features/settings/components/FontSelector';
import { ModeSelector } from '@/src/features/settings/components/ModeSelector';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { ThemeSelector } from '@/src/features/settings/components/ThemeSelector';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet } from 'react-native';
import { AppToggle } from '@/src/components/core';
import { Stack } from '@/src/design-system';

export function AppearanceSettingsScreen() {
  const { theme } = useTheme();
  const vm = useSettingsViewModel();

  return (
    <Screen
      title={AppConfig.strings.settings.sections.appearance}
      showBack={true}
      scrollable
      withPadding
      edges={['top', 'bottom']}
    >
      <Stack space="xxl" style={styles.container}>
        <ThemeSelector themeId={vm.themeId} setThemeId={vm.setThemeId} theme={theme} />

        <ModeSelector
          themePreference={vm.themePreference}
          setThemePreference={vm.setThemePreference}
        />

        <FontSelector fontId={vm.fontId} setFontId={vm.setFontId} theme={theme} />

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.xxxxl,
  },
});
