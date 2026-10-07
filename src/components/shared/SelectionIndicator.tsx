import { AppIcon } from '@/src/components/core/AppIcon';
import { BorderWidth, Opacity, Shape, Size } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon } from '@/src/types/domainIcons';
import { withOpacity } from '@/src/utils/color-math';
import { StyleSheet, View } from 'react-native';

/** Decorative only: the containing row owns its selection state and touch target. */
export function SelectionIndicator({
  selected,
  size = Size.md,
  color,
  borderColor,
}: {
  selected: boolean | 'mixed';
  size?: number;
  color?: string;
  borderColor?: string;
}) {
  const { theme, onContrast } = useTheme();
  const accent = color ?? theme.primary;
  const foreground = color ? onContrast(accent) : theme.onPrimary;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.frame,
        styles.circle,
        {
          width: size,
          height: size,
          borderColor: selected ? accent : (borderColor ?? theme.border),
          backgroundColor:
            selected === true
              ? accent
              : selected === 'mixed'
                ? withOpacity(accent, Opacity.soft)
                : 'transparent',
        },
      ]}
    >
      {selected === true ? (
        <AppIcon name={Icon.Check} size={Math.round(size * 0.5)} color={foreground} />
      ) : selected === 'mixed' ? (
        <View style={{ width: size / 3, height: BorderWidth.medium, backgroundColor: accent }} />
      ) : null}
    </View>
  );
}

/** Always reserves its footprint, including when the option is not selected. */
export function SelectionCheckmark({
  selected,
  size = Size.iconSm,
  color,
}: {
  selected: boolean;
  size?: number;
  color?: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { width: size, height: size }]}
    >
      {selected ? <AppIcon name={Icon.Check} size={size} color={color ?? theme.primary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  circle: { borderRadius: Shape.radius.full, borderWidth: BorderWidth.medium },
});
