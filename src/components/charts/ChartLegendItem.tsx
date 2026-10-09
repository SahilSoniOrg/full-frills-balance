import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { StyleSheet, View } from 'react-native';

/** A short line swatch and caption naming one chart series. */
export function ChartLegendItem({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <View style={styles.item}>
      <View style={[styles.line, { borderColor: color }, dashed && styles.dashed]} />
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minHeight: 24 },
  line: { width: 16, borderTopWidth: 2 },
  dashed: { borderStyle: 'dashed' },
});
