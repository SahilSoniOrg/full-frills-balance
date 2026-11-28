import { AppText, Icon, IconButton, PressScaleTouchable } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { Inline } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export type ListSectionHeaderProps = {
  title: string;
  /** Pill count beside the title. */
  count?: number | string;
  /** Optional mark before the title (e.g. section color dot). */
  leading?: ReactNode;
  /** Trailing value inside the title row (e.g. MoneyText), before actions/chevron. */
  amount?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  /** Extra controls before the chevron (e.g. create). */
  actions?: ReactNode;
  /** Replaces the chevron (e.g. a selection checkbox). */
  trailing?: ReactNode;
  /** Override chevron visibility. Defaults to on when collapsible and no trailing. */
  showChevron?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Collapsible list section heading: bold title, count pill, optional amount, chevron on the right.
 */
export function ListSectionHeader({
  title,
  count,
  leading,
  amount,
  expanded = true,
  onToggle,
  onLongPress,
  delayLongPress,
  actions,
  trailing,
  showChevron,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ListSectionHeaderProps) {
  const { theme } = useTheme();
  const isCollapsible = typeof onToggle === 'function';
  const isPressable = isCollapsible || typeof onLongPress === 'function';
  const resolvedShowChevron = showChevron ?? (isCollapsible && trailing == null);
  // Explicit labels win. Otherwise only synthesize when there is no amount —
  // an accessibilityLabel on the pressable would hide MoneyText from VoiceOver.
  const resolvedLabel =
    accessibilityLabel ??
    (amount == null ? (count == null ? title : `${title}, ${count}`) : undefined);

  const titleRow = (
    <Inline align="center" justifyContent="space-between" gap="md" style={styles.summaryRow}>
      <Inline align="center" gap="sm" style={styles.titleCluster}>
        {leading}
        <AppText
          variant="subheading"
          weight="bold"
          color="secondary"
          numberOfLines={1}
          style={styles.title}
        >
          {title}
        </AppText>
        {count != null ? (
          <View style={[styles.countBadge, { backgroundColor: theme.surfaceSecondary }]}>
            <AppText variant="caption" weight="bold" color="tertiary">
              {count}
            </AppText>
          </View>
        ) : null}
      </Inline>
      {amount != null ? <View style={styles.amountSlot}>{amount}</View> : null}
    </Inline>
  );

  return (
    <Inline align="center" gap="sm" style={style}>
      {isPressable ? (
        <PressScaleTouchable
          onPress={onToggle}
          onLongPress={onLongPress}
          delayLongPress={delayLongPress}
          style={styles.pressable}
          accessibilityRole="button"
          accessibilityState={isCollapsible ? { expanded } : undefined}
          accessibilityLabel={resolvedLabel}
          accessibilityHint={accessibilityHint}
          testID={testID}
        >
          {titleRow}
        </PressScaleTouchable>
      ) : (
        <View
          style={styles.staticHeader}
          accessibilityRole="header"
          accessibilityLabel={resolvedLabel}
          testID={testID}
        >
          {titleRow}
        </View>
      )}

      {actions}

      {trailing != null ? (
        trailing
      ) : resolvedShowChevron ? (
        <IconButton
          name={expanded ? Icon.ChevronDown : Icon.ChevronRight}
          size={Size.iconSm}
          style={styles.chevronButton}
          variant="clear"
          iconColor={theme.textSecondary}
          onPress={onToggle}
          disabled={!isCollapsible}
          // Title row already exposes the toggle; keep the chevron as a sighted hit target only.
          accessible={!isCollapsible}
          importantForAccessibility={isCollapsible ? 'no-hide-descendants' : 'auto'}
          accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${title} section`}
        />
      ) : null}
    </Inline>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    minWidth: 0,
    minHeight: Size.touchTarget,
    justifyContent: 'center',
  },
  staticHeader: {
    flex: 1,
    minWidth: 0,
  },
  summaryRow: {
    flex: 1,
    minWidth: 0,
  },
  titleCluster: {
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    flexShrink: 1,
  },
  amountSlot: {
    flexShrink: 0,
  },
  countBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs / 2,
    borderRadius: Shape.radius.sm,
    minWidth: Size.iconSm,
    alignItems: 'center',
  },
  chevronButton: {
    minWidth: Size.touchTarget,
    minHeight: Size.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
