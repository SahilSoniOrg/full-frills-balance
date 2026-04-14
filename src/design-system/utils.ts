import {
  Opacity,
  OpacityKey,
  RadiusKey,
  Shape,
  Spacing,
  SpacingKey,
  Theme,
} from '@/src/constants/design-tokens';
import { withOpacity } from '@/src/utils/color-math';

export function resolveSpacing(value: SpacingKey | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  return Spacing[value];
}

export function resolveRadius(value: RadiusKey | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  return Shape.radius[value];
}

export function resolveThemeColor(
  theme: Theme,
  color: keyof Theme | string | undefined,
  opacity?: OpacityKey | number,
): string | undefined {
  if (color === undefined) return undefined;
  const baseColor = color in theme ? theme[color as keyof Theme] : color;

  if (opacity !== undefined) {
    const opacityValue = typeof opacity === 'number' ? opacity : Opacity[opacity];
    return withOpacity(baseColor, opacityValue);
  }

  return baseColor;
}

export function negateSpace(value: SpacingKey | number | undefined): number | undefined {
  const resolved = resolveSpacing(value);
  if (resolved === undefined) return undefined;
  return -resolved;
}
