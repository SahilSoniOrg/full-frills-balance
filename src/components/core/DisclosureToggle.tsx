import { Size, Spacing } from '@/src/constants/design-tokens';
import { Icon } from '@/src/types/domainIcons';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppIcon } from './AppIcon';
import { AppText } from './AppText';
import { PressScaleTouchable } from './PressScaleTouchable';

export interface DisclosureToggleProps {
  label: string;
  /** Secondary text before the chevron, e.g. a count or "Show chart". */
  meta?: string | number;
  /** Right-side content before the chevron (e.g. a section total). */
  trailing?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** Defaults to true. Hide when a sibling control (e.g. select checkbox) owns the trailing slot. */
  showChevron?: boolean;
}

/** In-section row that shows or hides the content below it. */
export function DisclosureToggle({
  label,
  meta,
  trailing,
  expanded,
  onToggle,
  onLongPress,
  delayLongPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
  showChevron = true,
}: DisclosureToggleProps) {
  return (
    <PressScaleTouchable
      onPress={onToggle}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      pressScale="subtle"
      style={[styles.row, style]}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={accessibilityLabel ?? (meta === undefined ? label : `${label}, ${meta}`)}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      <AppText variant="bodySmall" weight="medium" style={trailing ? undefined : styles.label}>
        {label}
      </AppText>
      {meta !== undefined ? (
        <AppText variant="caption" color="secondary" tabular>
          {meta}
        </AppText>
      ) : null}
      {trailing ? <View style={styles.spacer} /> : null}
      {trailing}
      {showChevron ? (
        <AppIcon
          name={expanded ? Icon.ChevronUp : Icon.ChevronDown}
          size={Size.iconXs}
          color="textSecondary"
        />
      ) : null}
    </PressScaleTouchable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: { flex: 1, minWidth: 0 },
  spacer: { flex: 1, minWidth: Spacing.sm },
});
