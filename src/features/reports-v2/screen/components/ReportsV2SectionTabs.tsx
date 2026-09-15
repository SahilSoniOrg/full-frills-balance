import { AppText, type SegmentedOption } from '@/src/components/core';
import { Spacing, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

export function ReportsV2SectionTabs({
  options,
  value,
  onChange,
}: {
  options: readonly SegmentedOption<string>[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[styles.sectionTabs, { borderBottomColor: theme.border }]}
      accessibilityRole="tablist"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sectionTabsContent}
      >
        {options.map(option => {
          const isActive = option.id === value;
          return (
            <Pressable
              key={option.id}
              onPress={() => onChange(option.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={option.label}
              style={[styles.sectionTab, isActive && { borderBottomColor: theme.primary }]}
            >
              <AppText
                variant="caption"
                weight={isActive ? 'semibold' : 'regular'}
                style={[
                  styles.sectionTabText,
                  { color: isActive ? theme.primary : theme.textSecondary },
                ]}
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTabs: { borderBottomWidth: 1 },
  sectionTabsContent: { flexDirection: 'row', gap: Spacing.lg, paddingHorizontal: Spacing.xs },
  sectionTab: {
    minHeight: 44,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  sectionTabText: { textTransform: 'uppercase', letterSpacing: Typography.letterSpacing.wide },
});
