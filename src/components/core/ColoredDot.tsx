/**
 * ColoredDot — Small colored indicator circle.
 * Used for legend items, chart labels, and status markers.
 * The visual token for "this color means something" without relying on hue alone.
 */
import { Shape } from '@/src/constants/design-tokens';
import { View, type ViewStyle } from 'react-native';

export type ColoredDotProps = {
  color: string;
  size?: number;
  rounded?: boolean;
  style?: ViewStyle;
};

export function ColoredDot({ color, size = 8, rounded = true, style }: ColoredDotProps) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: rounded ? Shape.radius.full : Shape.radius.xs,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}
