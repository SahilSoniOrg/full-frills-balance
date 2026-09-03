import { AppButton, AppCard, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing, Typography } from '@/src/constants';
import type { ImportPlugin } from '@/src/services/import/types';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/src/hooks/use-theme';

export function ImportPluginCard({
  plugin,
  index,
  isBusy,
  onSelect,
  testIDPrefix,
}: {
  readonly plugin: ImportPlugin;
  readonly index: number;
  readonly isBusy: boolean;
  readonly onSelect: (id: string) => void;
  readonly testIDPrefix: string;
}) {
  const { theme } = useTheme();
  const handleSelect = useCallback(() => onSelect(plugin.id), [onSelect, plugin.id]);

  return (
    <AppCard elevation="sm" paddingSize="md" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.iconPlaceholder, { backgroundColor: theme.surfaceSecondary }]}>
          <AppText variant="heading" style={styles.pluginIcon}>
            {plugin.icon}
          </AppText>
        </View>
        <View style={styles.textCol}>
          <AppText variant="subheading">{plugin.name}</AppText>
          <AppText variant="caption" color="secondary" style={styles.desc}>
            {plugin.description}
          </AppText>
        </View>
      </View>
      <AppButton
        variant={index === 0 ? 'primary' : 'outline'}
        testID={`${testIDPrefix}-${plugin.id}`}
        onPress={handleSelect}
        loading={isBusy}
        disabled={isBusy}
        style={styles.button}
      >
        {AppConfig.strings.settings.selectFile(plugin.name.split(' ')[0])}
      </AppButton>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.sm },
  headerRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  iconPlaceholder: {
    width: Size.xxl,
    height: Size.xxl,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  pluginIcon: { fontSize: Typography.sizes.xxl },
  textCol: { flex: 1 },
  desc: {
    marginTop: Spacing.xs,
    lineHeight: Typography.sizes.base * Typography.lineHeights.normal,
  },
  button: { width: '100%' },
});
