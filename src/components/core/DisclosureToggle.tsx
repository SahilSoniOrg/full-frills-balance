import { Size, Spacing } from '@/src/constants/design-tokens';
import { Icon } from '@/src/types/domainIcons';
import { StyleSheet } from 'react-native';
import { AppIcon } from './AppIcon';
import { AppText } from './AppText';
import { PressScaleTouchable } from './PressScaleTouchable';

export interface DisclosureToggleProps {
  label: string;
  /** Secondary text before the chevron, e.g. a count or "Show chart". */
  meta?: string | number;
  expanded: boolean;
  onToggle: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

/** In-section row that shows or hides the content below it. */
export function DisclosureToggle({
  label,
  meta,
  expanded,
  onToggle,
  accessibilityLabel,
  testID,
}: DisclosureToggleProps) {
  return (
    <PressScaleTouchable
      onPress={onToggle}
      pressScale="subtle"
      style={styles.row}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={accessibilityLabel ?? (meta === undefined ? label : `${label}, ${meta}`)}
      testID={testID}
    >
      <AppText variant="bodySmall" weight="medium" style={styles.label}>
        {label}
      </AppText>
      {meta !== undefined ? (
        <AppText variant="caption" color="secondary" tabular>
          {meta}
        </AppText>
      ) : null}
      <AppIcon
        name={expanded ? Icon.ChevronUp : Icon.ChevronDown}
        size={Size.iconXs}
        color="textSecondary"
      />
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
});
