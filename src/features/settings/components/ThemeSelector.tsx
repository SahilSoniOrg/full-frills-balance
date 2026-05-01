import { AppCard, AppText } from '@/src/components/core';
import { AppConfig, Spacing, ThemeId, ThemeIds } from '@/src/constants';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

interface ThemeSelectorProps {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  theme: any;
}

export function ThemeSelector({ themeId, setThemeId, theme }: ThemeSelectorProps) {
  return (
    <View style={styles.container}>
      <AppText variant="subheading" style={styles.sectionTitle}>
        {AppConfig.strings.settings.appearance.themeTitle}
      </AppText>
      <AppText variant="body" color="secondary" style={styles.sectionDesc}>
        {AppConfig.strings.settings.appearance.themeDesc}
      </AppText>

      <View style={styles.optionsContainer}>
        <Pressable onPress={() => setThemeId(ThemeIds.DEEP_SPACE)}>
          <AppCard
            elevation={themeId === ThemeIds.DEEP_SPACE ? 'sm' : 'none'}
            style={[
              styles.optionCard,
              { borderWidth: themeId === ThemeIds.DEEP_SPACE ? 2 : 1 },
              { borderColor: themeId === ThemeIds.DEEP_SPACE ? theme.primary : theme.border },
            ]}
          >
            <View style={styles.optionContent}>
              <View style={[styles.colorPreview, { backgroundColor: '#0F1A25' }]} />
              <View style={{ flex: 1 }}>
                <AppText weight="bold">
                  {AppConfig.strings.settings.appearance.deepSpace.label}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.settings.appearance.deepSpace.desc}
                </AppText>
              </View>
              {themeId === ThemeIds.DEEP_SPACE && (
                <View
                  style={[
                    styles.radio,
                    { borderColor: theme.primary, backgroundColor: theme.primary },
                  ]}
                />
              )}
              {themeId !== ThemeIds.DEEP_SPACE && (
                <View style={[styles.radio, { borderColor: theme.border }]} />
              )}
            </View>
          </AppCard>
        </Pressable>

        <Pressable onPress={() => setThemeId(ThemeIds.GOLD_OBSIDIAN)}>
          <AppCard
            elevation={themeId === ThemeIds.GOLD_OBSIDIAN ? 'sm' : 'none'}
            style={[
              styles.optionCard,
              { borderWidth: themeId === ThemeIds.GOLD_OBSIDIAN ? 2 : 1 },
              { borderColor: themeId === ThemeIds.GOLD_OBSIDIAN ? theme.primary : theme.border },
            ]}
          >
            <View style={styles.optionContent}>
              <View style={[styles.colorPreview, { backgroundColor: '#C5A050' }]} />
              <View style={{ flex: 1 }}>
                <AppText weight="bold">
                  {AppConfig.strings.settings.appearance.goldObsidian.label}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.settings.appearance.goldObsidian.desc}
                </AppText>
              </View>
              {themeId === ThemeIds.GOLD_OBSIDIAN && (
                <View
                  style={[
                    styles.radio,
                    { borderColor: theme.primary, backgroundColor: theme.primary },
                  ]}
                />
              )}
              {themeId !== ThemeIds.GOLD_OBSIDIAN && (
                <View style={[styles.radio, { borderColor: theme.border }]} />
              )}
            </View>
          </AppCard>
        </Pressable>

        <Pressable onPress={() => setThemeId(ThemeIds.IVY)}>
          <AppCard
            elevation={themeId === ThemeIds.IVY ? 'sm' : 'none'}
            style={[
              styles.optionCard,
              { borderWidth: themeId === ThemeIds.IVY ? 2 : 1 },
              { borderColor: themeId === ThemeIds.IVY ? theme.primary : theme.border },
            ]}
          >
            <View style={styles.optionContent}>
              <View
                style={[
                  styles.colorPreview,
                  { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ccc' },
                ]}
              />
              <View style={{ flex: 1 }}>
                <AppText weight="bold">{AppConfig.strings.settings.appearance.ivy.label}</AppText>
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.settings.appearance.ivy.desc}
                </AppText>
              </View>
              {themeId === ThemeIds.IVY && (
                <View
                  style={[
                    styles.radio,
                    { borderColor: theme.primary, backgroundColor: theme.primary },
                  ]}
                />
              )}
              {themeId !== ThemeIds.IVY && (
                <View style={[styles.radio, { borderColor: theme.border }]} />
              )}
            </View>
          </AppCard>
        </Pressable>

        <Pressable onPress={() => setThemeId(ThemeIds.EDITORIAL)}>
          <AppCard
            elevation={themeId === ThemeIds.EDITORIAL ? 'sm' : 'none'}
            style={[
              styles.optionCard,
              { borderWidth: themeId === ThemeIds.EDITORIAL ? 2 : 1 },
              { borderColor: themeId === ThemeIds.EDITORIAL ? theme.primary : theme.border },
            ]}
          >
            <View style={styles.optionContent}>
              <View style={[styles.colorPreview, { backgroundColor: '#2C3E50' }]} />
              <View style={{ flex: 1 }}>
                <AppText weight="bold">
                  {AppConfig.strings.settings.appearance.editorial.label}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.settings.appearance.editorial.desc}
                </AppText>
              </View>
              {themeId === ThemeIds.EDITORIAL && (
                <View
                  style={[
                    styles.radio,
                    { borderColor: theme.primary, backgroundColor: theme.primary },
                  ]}
                />
              )}
              {themeId !== ThemeIds.EDITORIAL && (
                <View style={[styles.radio, { borderColor: theme.border }]} />
              )}
            </View>
          </AppCard>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  sectionDesc: {
    marginBottom: Spacing.md,
  },
  optionsContainer: {
    gap: Spacing.md,
  },
  optionCard: {
    padding: Spacing.md,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  colorPreview: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
});
