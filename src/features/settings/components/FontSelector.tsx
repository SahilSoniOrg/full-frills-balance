import { AppCard, AppText } from '@/src/components/core';
import { AppConfig, FontId, FontIds, FontSchemes, Spacing } from '@/src/constants';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

interface FontSelectorProps {
  fontId: FontId;
  setFontId: (id: FontId) => void;
  theme: any;
}

export function FontSelector({ fontId, setFontId, theme }: FontSelectorProps) {
  return (
    <View style={styles.container}>
      <AppText variant="subheading" style={styles.sectionTitle}>
        {AppConfig.strings.settings.appearance.typographyTitle}
      </AppText>
      <AppText variant="body" color="secondary" style={styles.sectionDesc}>
        {AppConfig.strings.settings.appearance.typographyDesc}
      </AppText>

      <View style={styles.optionsContainer}>
        <Pressable onPress={() => setFontId(FontIds.DEEP_SPACE)}>
          <AppCard
            elevation={fontId === FontIds.DEEP_SPACE ? 'sm' : 'none'}
            style={[
              styles.optionCard,
              { borderWidth: fontId === FontIds.DEEP_SPACE ? 2 : 1 },
              { borderColor: fontId === FontIds.DEEP_SPACE ? theme.primary : theme.border },
            ]}
          >
            <View style={styles.optionContent}>
              <View style={{ flex: 1 }}>
                <AppText
                  variant="heading"
                  style={{ fontFamily: FontSchemes[FontIds.DEEP_SPACE].heading, marginBottom: 4 }}
                >
                  {AppConfig.strings.settings.appearance.preview}
                </AppText>
                <AppText weight="bold">
                  {AppConfig.strings.settings.appearance.serifSans.label}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.settings.appearance.serifSans.desc}
                </AppText>
              </View>
              {fontId === FontIds.DEEP_SPACE && (
                <View
                  style={[
                    styles.radio,
                    { borderColor: theme.primary, backgroundColor: theme.primary },
                  ]}
                />
              )}
              {fontId !== FontIds.DEEP_SPACE && (
                <View style={[styles.radio, { borderColor: theme.border }]} />
              )}
            </View>
          </AppCard>
        </Pressable>

        <Pressable onPress={() => setFontId(FontIds.IVY)}>
          <AppCard
            elevation={fontId === FontIds.IVY ? 'sm' : 'none'}
            style={[
              styles.optionCard,
              { borderWidth: fontId === FontIds.IVY ? 2 : 1 },
              { borderColor: fontId === FontIds.IVY ? theme.primary : theme.border },
            ]}
          >
            <View style={styles.optionContent}>
              <View style={{ flex: 1 }}>
                <AppText
                  variant="heading"
                  style={{ fontFamily: FontSchemes[FontIds.IVY].heading, marginBottom: 4 }}
                >
                  {AppConfig.strings.settings.appearance.preview}
                </AppText>
                <AppText weight="bold">
                  {AppConfig.strings.settings.appearance.modernGeometric.label}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.settings.appearance.modernGeometric.desc}
                </AppText>
              </View>
              {fontId === FontIds.IVY && (
                <View
                  style={[
                    styles.radio,
                    { borderColor: theme.primary, backgroundColor: theme.primary },
                  ]}
                />
              )}
              {fontId !== FontIds.IVY && (
                <View style={[styles.radio, { borderColor: theme.border }]} />
              )}
            </View>
          </AppCard>
        </Pressable>

        <Pressable onPress={() => setFontId(FontIds.EDITORIAL)}>
          <AppCard
            elevation={fontId === FontIds.EDITORIAL ? 'sm' : 'none'}
            style={[
              styles.optionCard,
              { borderWidth: fontId === FontIds.EDITORIAL ? 2 : 1 },
              { borderColor: fontId === FontIds.EDITORIAL ? theme.primary : theme.border },
            ]}
          >
            <View style={styles.optionContent}>
              <View style={{ flex: 1 }}>
                <AppText
                  variant="heading"
                  style={{ fontFamily: FontSchemes[FontIds.EDITORIAL].heading, marginBottom: 4 }}
                >
                  {AppConfig.strings.settings.appearance.preview}
                </AppText>
                <AppText weight="bold">
                  {AppConfig.strings.settings.appearance.classicSerif.label}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.settings.appearance.classicSerif.desc}
                </AppText>
              </View>
              {fontId === FontIds.EDITORIAL && (
                <View
                  style={[
                    styles.radio,
                    { borderColor: theme.primary, backgroundColor: theme.primary },
                  ]}
                />
              )}
              {fontId !== FontIds.EDITORIAL && (
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
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
});
