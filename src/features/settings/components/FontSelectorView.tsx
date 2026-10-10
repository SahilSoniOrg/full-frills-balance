import { ListRow, AppText, ListGroup } from '@/src/components/core';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { AppConfig, FontId, FontIds, FontSchemes } from '@/src/constants';
import { SelectionIndicator } from '@/src/components/shared/SelectionIndicator';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { logger } from '@/src/utils/logger';
import { ensureAllFontSetsLoaded, isFontSetLoaded } from '@/src/utils/loadFontSet';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

type FontSelectorProps = {
  fontId: FontId;
  setFontId: (id: FontId) => void;
};

const FONT_OPTIONS = [
  {
    id: FontIds.DEEP_SPACE,
    label: AppConfig.strings.settings.appearance.serifSans.label,
    desc: AppConfig.strings.settings.appearance.serifSans.desc,
  },
  {
    id: FontIds.IVY,
    label: AppConfig.strings.settings.appearance.modernGeometric.label,
    desc: AppConfig.strings.settings.appearance.modernGeometric.desc,
  },
  {
    id: FontIds.EDITORIAL,
    label: AppConfig.strings.settings.appearance.classicSerif.label,
    desc: AppConfig.strings.settings.appearance.classicSerif.desc,
  },
] as const;

export function FontSelectorView({ fontId, setFontId }: FontSelectorProps) {
  const { theme, fonts } = useTheme();
  const [previewsReady, setPreviewsReady] = useState(() =>
    FONT_OPTIONS.every(option => isFontSetLoaded(option.id)),
  );

  useEffect(() => {
    let active = true;
    void ensureAllFontSetsLoaded()
      .then(() => {
        if (active) setPreviewsReady(true);
      })
      .catch(error => {
        logger.error('[Fonts] Failed to preload settings font schemes', error);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ListGroup variant="plain">
      <Stack space={0}>
        <ListRow
          focusId="typography"
          leading={
            <AppText variant="body" weight="bold" style={{ color: theme.primary }}>
              Aa
            </AppText>
          }
          title={AppConfig.strings.settings.appearance.typographyTitle}
          subtitle={AppConfig.strings.settings.appearance.typographyDesc}
          chevron={false}
        />
        <Box paddingHorizontal="md" marginTop="md">
          <View
            style={[styles.list, { borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            {FONT_OPTIONS.map((option, index) => {
              const selected = fontId === option.id;
              const font = FontSchemes[option.id];

              return (
                <PressScaleTouchable
                  pressScale="subtle"
                  haptic="selection"
                  key={option.id}
                  onPress={() => setFontId(option.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.row,
                    index < FONT_OPTIONS.length - 1 && {
                      borderBottomColor: theme.border,
                      borderBottomWidth: 1,
                    },
                  ]}
                >
                  <View style={[styles.preview, { backgroundColor: theme.surfaceSecondary }]}>
                    <AppText
                      variant="heading"
                      style={{
                        fontFamily: previewsReady ? font.heading : fonts.heading,
                        color: selected ? theme.primary : theme.text,
                      }}
                    >
                      Aa
                    </AppText>
                    <AppText
                      variant="caption"
                      tabular
                      color="secondary"
                      style={{
                        fontFamily: previewsReady
                          ? (font.numeric ?? font).semibold
                          : (fonts.numeric ?? fonts).semibold,
                      }}
                    >
                      1,234
                    </AppText>
                  </View>

                  <View style={styles.copy}>
                    <AppText
                      variant="body"
                      weight="semibold"
                      style={{ fontFamily: previewsReady ? font.semibold : fonts.semibold }}
                    >
                      {option.label}
                    </AppText>
                    <AppText
                      variant="caption"
                      color="secondary"
                      style={{ fontFamily: previewsReady ? font.regular : fonts.regular }}
                    >
                      {option.desc}
                    </AppText>
                  </View>

                  <SelectionIndicator selected={selected} size={22} />
                </PressScaleTouchable>
              );
            })}
          </View>
        </Box>
      </Stack>
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  list: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  preview: {
    width: 56,
    minHeight: 56,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
});
