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

/**
 * Common spacing resolver (Padding cannot be 'auto' in semantics)
 */
export function resolvePaddingSpacing(value: SpacingKey | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  return Spacing[value as SpacingKey];
}

/**
 * Margin spacing resolver (Supports 'auto')
 */
export function resolveMarginSpacing(
  value: SpacingKey | number | 'auto' | undefined,
): number | string | undefined {
  if (value === undefined) return undefined;
  if (value === 'auto') return 'auto';
  if (typeof value === 'number') return value;
  return Spacing[value as SpacingKey];
}

/**
 * @deprecated Use resolvePaddingSpacing or resolveMarginSpacing
 */
export function resolveSpacing(
  value: SpacingKey | number | 'auto' | undefined,
): number | string | undefined {
  if (value === undefined) return undefined;
  if (value === 'auto') return 'auto';
  if (typeof value === 'number') return value;
  return Spacing[value as SpacingKey];
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
  const resolved = resolvePaddingSpacing(value);
  if (resolved === undefined) return undefined;
  return -resolved;
}

export const BOX_PROP_KEY_LIST = [
  'padding',
  'paddingHorizontal',
  'paddingVertical',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'marginHorizontal',
  'marginVertical',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'background',
  'backgroundOpacity',
  'unsafe_backgroundRaw',
  'shadow',
  'flex',
  'flexDirection',
  'alignItems',
  'justifyContent',
  'flexWrap',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'gap',
  'alignSelf',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'zIndex',
  'overflow',
  'opacity',
  'borderColor',
  'borderWidth',
  'borderTopWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'as',
  'style',
  'display',
  'aspectRatio',
] as const;

export type BoxPropKey = (typeof BOX_PROP_KEY_LIST)[number];

export const BOX_PROP_KEYS: ReadonlySet<string> = new Set(BOX_PROP_KEY_LIST);

export const LAYOUT_STYLE_KEYS = new Set([
  'margin',
  'marginHorizontal',
  'marginVertical',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'position',
  'top',
  'bottom',
  'left',
  'right',
  'zIndex',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'display',
  'aspectRatio',
]);

/**
 * Separates Box layout/system props from component-specific props.
 * Used to prevent prop leakage to native components like TextInput.
 */
export type ExtractedBoxProps<T extends object> = Pick<T, Extract<keyof T, BoxPropKey>>;
export type ExtractedRestProps<T extends object> = Omit<T, Extract<keyof T, BoxPropKey>>;

export function extractBoxProps<T extends object>(
  props: T,
): {
  boxProps: ExtractedBoxProps<T>;
  restProps: ExtractedRestProps<T>;
} {
  const boxProps: Record<string, unknown> = {};
  const restProps: Record<string, unknown> = {};

  for (const key in props) {
    if (BOX_PROP_KEYS.has(key)) {
      boxProps[key] = props[key];
    } else {
      restProps[key] = props[key];
    }
  }

  return {
    boxProps: boxProps as ExtractedBoxProps<T>,
    restProps: restProps as ExtractedRestProps<T>,
  };
}

/**
 * Splits a style object into two buckets:
 * 1. Layout styles (margin, flex, width, position)
 * 2. Decoration styles (padding, background, border)
 */
export function splitBoxStyles(style: any) {
  const layoutStyle: any = {};
  const decorationStyle: any = {};

  if (!style) return { layoutStyle, decorationStyle };

  const processStyle = (s: any) => {
    if (!s) return;
    if (Array.isArray(s)) {
      for (let i = 0; i < s.length; i++) {
        processStyle(s[i]);
      }
      return;
    }

    for (const key in s) {
      if (LAYOUT_STYLE_KEYS.has(key)) {
        layoutStyle[key] = s[key];
      } else {
        decorationStyle[key] = s[key];
      }
    }
  };

  processStyle(style);

  return { layoutStyle, decorationStyle };
}
