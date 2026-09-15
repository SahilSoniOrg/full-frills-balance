import { AppIcon, AppText, Icon } from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import type { ReportWarning } from '@/src/services/reports-v2/types/result';
import { Pressable, StyleSheet, View } from 'react-native';

export function ReportsV2QualityBanner({
  warnings,
  onPress,
}: {
  warnings: readonly ReportWarning[];
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const errorCount = warnings.reduce(
    (total, warning) => total + (warning.severity === 'ERROR' ? (warning.count ?? 1) : 0),
    0,
  );
  const warningCount = warnings.reduce(
    (total, warning) => total + (warning.severity === 'WARNING' ? (warning.count ?? 1) : 0),
    0,
  );
  const infoCount = warnings.reduce(
    (total, warning) => total + (warning.severity === 'INFO' ? (warning.count ?? 1) : 0),
    0,
  );
  const tone = errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'asset';
  const color = theme[tone];
  const backgroundColor =
    tone === 'error'
      ? theme.errorLight
      : tone === 'warning'
        ? theme.warningLight
        : theme.assetLight;
  const headline =
    errorCount > 0
      ? 'Needs attention'
      : warningCount > 0
        ? 'A few checks need review'
        : 'Report checks complete';
  const detail =
    errorCount > 0
      ? `${errorCount.toLocaleString()} error${errorCount === 1 ? '' : 's'} found in this period`
      : warningCount > 0
        ? `${warningCount.toLocaleString()} warning${warningCount === 1 ? '' : 's'} found in this period`
        : infoCount > 0
          ? `${infoCount.toLocaleString()} informational note${infoCount === 1 ? '' : 's'}`
          : 'No data quality issues found in this period';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open report health"
      style={[styles.qualityBanner, { borderColor: color }]}
    >
      <View style={[styles.qualityIcon, { backgroundColor }]}>
        <AppIcon
          name={errorCount > 0 ? Icon.Alert : warningCount > 0 ? Icon.Error : Icon.CheckCircle}
          size={18}
          color={color}
        />
      </View>
      <View style={styles.qualityCopy}>
        <AppText variant="body" weight="semibold">
          {headline}
        </AppText>
        <AppText variant="caption" color="secondary" numberOfLines={1}>
          {detail}
        </AppText>
      </View>
      <AppIcon name={Icon.ChevronRight} size={18} color="textSecondary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  qualityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: Shape.radius.r2,
    padding: Spacing.md,
  },
  qualityIcon: {
    width: 34,
    height: 34,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityCopy: { flex: 1, gap: Spacing.xs },
});
