import { AppConfig, FontId, FontIds, FontSchemes, Opacity } from '@/src/constants';
import { AppText } from '@/src/components/core';
import { SettingsSelectionIndicator } from '@/src/components/settings/SettingsSelectionIndicator';
import { Box, Stack } from '@/src/design-system';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useTheme } from '@/src/hooks/use-theme';
import { Pressable, StyleSheet, View } from 'react-native';

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
  const { theme } = useTheme();
  return (
    <Stack space={0}>
      <SettingsMenuItem
        searchId="typography"
        leftIcon={
          <AppText variant="body" weight="bold" style={{ color: theme.primary }}>
            Aa
          </AppText>
        }
        title={AppConfig.strings.settings.appearance.typographyTitle}
        description={AppConfig.strings.settings.appearance.typographyDesc}
        hasArrow={false}
      />
      <Box paddingHorizontal="md" marginTop="md">
        <View style={[styles.list, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          {FONT_OPTIONS.map((option, index) => {
            const selected = fontId === option.id;
            const font = FontSchemes[option.id];

            return (
              <Pressable
                key={option.id}
                onPress={() => setFontId(option.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.row,
                  index < FONT_OPTIONS.length - 1 && {
                    borderBottomColor: theme.border,
                    borderBottomWidth: 1,
                  },
                  pressed && { opacity: Opacity.heavy },
                ]}
              >
                <View style={[styles.preview, { backgroundColor: theme.surfaceSecondary }]}>
                  <AppText
                    variant="heading"
                    style={{
                      fontFamily: font.heading,
                      color: selected ? theme.primary : theme.text,
                    }}
                  >
                    Aa
                  </AppText>
                </View>

                <View style={styles.copy}>
                  <AppText variant="body" weight="semibold">
                    {option.label}
                  </AppText>
                  <AppText variant="caption" color="secondary" numberOfLines={1}>
                    {option.desc}
                  </AppText>
                </View>

                <SettingsSelectionIndicator selected={selected} />
              </Pressable>
            );
          })}
        </View>
      </Box>
    </Stack>
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
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
});
