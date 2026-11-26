import { Opacity, SelectionEdgeScrim, Shape, Size, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { useId } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export const SELECTION_BAR_MAX_WIDTH = 440;
const SCRIM_HEIGHT = Size.fab + Spacing.sm;

export function useSelectionBarSurface(edge: 'top' | 'bottom') {
  const { theme, themeMode } = useTheme();
  const isDark = themeMode === 'dark';
  const yDir = edge === 'top' ? 1 : -1;
  const elevation = isDark ? Shape.elevation.selectionDark : Shape.elevation.selection;
  const directedShadow = elevation.boxShadow?.replace(
    /0px (-?\d+)px/g,
    (_match, offsetY: string) => `0px ${Number(offsetY) * yDir}px`,
  );
  const primaryGlow = isDark
    ? `, 0px 0px 18px 0px ${withOpacity(theme.primary, Opacity.shadow)}`
    : '';

  const cardStyle: ViewStyle = {
    backgroundColor: isDark ? theme.surfaceSecondary : theme.surface,
    borderColor: withOpacity(theme.primary, isDark ? Opacity.muted : Opacity.active),
    boxShadow: `${directedShadow ?? ''}${primaryGlow}`,
    ...Platform.select({
      android: { elevation: elevation.elevation },
    }),
  };

  return { cardStyle, isDark, theme };
}

/** Soft feathered lift behind floating selection bars — short enough not to vignette list cards. */
export function SelectionEdgeShadow({ edge }: { edge: 'top' | 'bottom' }) {
  const { theme, themeMode } = useTheme();
  const isDark = themeMode === 'dark';
  const rawId = useId();
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const gradientId = `selection-edge-shadow-${edge}-${safeId}`;
  const isTop = edge === 'top';
  const baseColor = isDark ? theme.background : theme.text;
  const scrim = isDark ? SelectionEdgeScrim.dark : SelectionEdgeScrim.light;

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.scrim, isTop ? styles.topScrim : styles.bottomScrim]}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient
            id={gradientId}
            x1="0"
            y1={isTop ? '0' : '1'}
            x2="0"
            y2={isTop ? '1' : '0'}
          >
            <Stop offset="0%" stopColor={baseColor} stopOpacity={scrim.peak} />
            <Stop offset="45%" stopColor={baseColor} stopOpacity={scrim.mid} />
            <Stop offset="100%" stopColor={baseColor} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    left: -Spacing.md,
    right: -Spacing.md,
    height: SCRIM_HEIGHT,
  },
  topScrim: {
    top: -Spacing.sm,
  },
  bottomScrim: {
    bottom: -Spacing.sm,
  },
});
