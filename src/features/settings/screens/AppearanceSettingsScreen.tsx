import { Screen } from '@/src/components/layout';
import { Opacity, Spacing } from '@/src/constants';
import { FontSelector } from '@/src/features/settings/components/FontSelector';
import { ModeSelector } from '@/src/features/settings/components/ModeSelector';
import { ThemeSelector } from '@/src/features/settings/components/ThemeSelector';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export function AppearanceSettingsScreen() {
  const { theme } = useTheme();
  const vm = useSettingsViewModel();

  return (
    <Screen title="Appearance" showBack={true} scrollable withPadding edges={['top', 'bottom']}>
      <View style={styles.container}>
        <ThemeSelector themeId={vm.themeId} setThemeId={vm.setThemeId} theme={theme} />

        <View style={styles.divider} />

        <FontSelector fontId={vm.fontId} setFontId={vm.setFontId} theme={theme} />

        <View style={styles.divider} />

        <ModeSelector
          themePreference={vm.themePreference}
          setThemePreference={vm.setThemePreference}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.xxxxl,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginVertical: Spacing.lg,
    opacity: Opacity.hover,
  },
});
