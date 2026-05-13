import { AppConfig, ThemeId, ThemeIds, ThemeSchemes, Opacity } from '@/src/constants';
import { AppIcon, AppText } from '@/src/components/core';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { withOpacity } from '@/src/utils/color-math';

type ThemeSelectorViewProps = {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
};

const THEME_OPTIONS = [
  {
    id: ThemeIds.DEEP_SPACE,
    label: AppConfig.strings.settings.appearance.deepSpace.label,
    desc: AppConfig.strings.settings.appearance.deepSpace.desc,
  },
  {
    id: ThemeIds.GOLD_OBSIDIAN,
    label: AppConfig.strings.settings.appearance.goldObsidian.label,
    desc: AppConfig.strings.settings.appearance.goldObsidian.desc,
  },
  {
    id: ThemeIds.IVY,
    label: AppConfig.strings.settings.appearance.ivy.label,
    desc: AppConfig.strings.settings.appearance.ivy.desc,
  },
  {
    id: ThemeIds.EDITORIAL,
    label: AppConfig.strings.settings.appearance.editorial.label,
    desc: AppConfig.strings.settings.appearance.editorial.desc,
  },
] as const;

export function ThemeSelectorView({ themeId, setThemeId }: ThemeSelectorViewProps) {
  const { theme, onContrast } = useTheme();

  return (
    <View>
      <View style={styles.sectionHeader}>
        <AppText variant="subheading">{AppConfig.strings.settings.appearance.themeTitle}</AppText>
        <AppText variant="caption" color="secondary" style={styles.sectionDesc}>
          {AppConfig.strings.settings.appearance.themeDesc}
        </AppText>
      </View>

      <View style={styles.grid}>
        {THEME_OPTIONS.map(option => {
          const selected = themeId === option.id;
          const light = ThemeSchemes[option.id].light;
          const dark = ThemeSchemes[option.id].dark;

          const bg = selected ? light.primaryLight : theme.surface;
          const textColor = onContrast(bg);

          return (
            <Pressable
              key={option.id}
              onPress={() => setThemeId(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: bg,
                  borderColor: selected ? theme.primary : theme.border,
                  opacity: pressed ? Opacity.heavy : 1,
                },
              ]}
            >
              <View style={styles.swatchRail}>
                {[dark.background, dark.surface, dark.primary, light.background].map(
                  (color, index) => (
                    <View
                      key={`${option.id}-${index}`}
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: color,
                          borderColor: theme.border,
                        },
                      ]}
                    />
                  ),
                )}
              </View>

              <View style={styles.tileText}>
                <AppText
                  variant="body"
                  weight="semibold"
                  numberOfLines={1}
                  style={{ color: textColor }}
                >
                  {option.label}
                </AppText>
                <AppText
                  variant="caption"
                  numberOfLines={1}
                  style={{ color: withOpacity(textColor, Opacity.heavy) }}
                >
                  {option.desc}
                </AppText>
              </View>

              <View
                style={[
                  styles.check,
                  {
                    backgroundColor: selected ? theme.primary : theme.surfaceSecondary,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                {selected && <AppIcon name="check" size={13} color={theme.onPrimary} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    marginBottom: 12,
  },
  sectionDesc: {
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '48%',
    minHeight: 118,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    justifyContent: 'space-between',
  },
  swatchRail: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  tileText: {
    paddingRight: 20,
  },
  check: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
