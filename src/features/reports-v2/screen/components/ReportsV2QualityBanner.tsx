import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { AppIcon, Icon } from '@/src/components/core';
import { NoticeBanner } from '@/src/components/shared/NoticeBanner';
import { Size } from '@/src/constants/design-tokens';
import type { ReportWarning } from '@/src/services/reports-v2/types/result';

export function ReportsV2QualityBanner({
  warnings,
  onPress,
}: {
  warnings: readonly ReportWarning[];
  onPress: () => void;
}) {
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
  const tone = errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'info';
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
    <PressScaleTouchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open report health"
    >
      <NoticeBanner
        tone={tone}
        icon={errorCount > 0 ? Icon.Alert : warningCount > 0 ? Icon.Error : Icon.CheckCircle}
        title={headline}
        message={detail}
        action={<AppIcon name={Icon.ChevronRight} size={Size.iconSm} color="textSecondary" />}
      />
    </PressScaleTouchable>
  );
}
