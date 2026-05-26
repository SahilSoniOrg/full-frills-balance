import { AppConfig, FontId, FontIds, FontSchemes, Opacity } from '@/src/constants';
import { AppIcon, AppText } from '@/src/components/core';
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
    <View>
      <View style={styles.sectionHeader}>
        <AppText variant="subheading">
          {AppConfig.strings.settings.appearance.typographyTitle}
        </AppText>
        <AppText variant="caption" color="secondary" style={styles.sectionDesc}>
          {AppConfig.strings.settings.appearance.typographyDesc}
        </AppText>
      </View>

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
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
