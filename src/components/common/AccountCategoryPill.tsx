import { Shape } from '@/src/constants/design-tokens';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type PillSize = 'sm' | 'md';

const PILL_HEIGHTS: Record<PillSize, number> = {
  sm: 16,
  md: 18,
};

interface AccountCategoryPillProps {
  color: string;
  size?: PillSize;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tiny coloured bar that signals which account category (asset, liability, etc.)
 * an account belongs to. Used inline alongside account names across all listing
 * surfaces.
 */
export function AccountCategoryPill({
  color,
  size = 'md',
  opacity,
  style,
}: AccountCategoryPillProps) {
  return (
    <View
      style={[
        styles.pill,
        { height: PILL_HEIGHTS[size], backgroundColor: color },
        opacity != null && { opacity },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 4,
    borderRadius: Shape.radius.full,
  },
});
