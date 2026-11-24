import { Opacity, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { useId } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const SCRIM_HEIGHT = 72;

export function useSelectionBarSurface(edge: 'top' | 'bottom') {
  const { theme, themeMode } = useTheme();
  const isDark = themeMode === 'dark';
  const yDir = edge === 'top' ? 1 : -1;

  const cardStyle: ViewStyle = {
    backgroundColor: isDark ? theme.surfaceSecondary : theme.surface,
    borderColor: withOpacity(theme.primary, isDark ? Opacity.muted : Opacity.active),
    boxShadow: isDark
      ? [
          `0px ${yDir * 10}px 28px 2px ${withOpacity('#000000', 0.72)}`,
          `0px ${yDir * 3}px 10px 0px ${withOpacity('#000000', 0.5)}`,
          `0px 0px 18px 0px ${withOpacity(theme.primary, 0.12)}`,
        ].join(', ')
      : [
          `0px ${yDir * 10}px 24px 2px ${withOpacity('#000000', 0.18)}`,
          `0px ${yDir * 3}px 8px 0px ${withOpacity('#000000', 0.1)}`,
        ].join(', '),
    ...Platform.select({
      android: { elevation: 14 },
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
  const baseColor = isDark ? theme.background : '#000000';
  const peakOpacity = isDark ? 0.55 : 0.16;
  const midOpacity = isDark ? 0.22 : 0.06;

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
            <Stop offset="0%" stopColor={baseColor} stopOpacity={peakOpacity} />
            <Stop offset="45%" stopColor={baseColor} stopOpacity={midOpacity} />
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
