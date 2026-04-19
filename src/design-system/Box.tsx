import {
  ColorKey,
  ElevationKey,
  OpacityKey,
  RadiusKey,
  Shape,
  SpacingKey,
} from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import React, { forwardRef, useMemo } from 'react';
import {
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  StyleProp,
  TouchableOpacity,
  type TouchableOpacityProps,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import {
  extractBoxProps,
  resolveMarginSpacing,
  resolvePaddingSpacing,
  resolveRadius,
  resolveThemeColor,
} from './utils';

export type SpecialColor = 'transparent';
export type SurfaceColor = ColorKey | SpecialColor;

export type BoxBaseProps = {
  padding?: SpacingKey | number;
  paddingHorizontal?: SpacingKey | number;
  paddingVertical?: SpacingKey | number;
  paddingTop?: SpacingKey | number;
  paddingRight?: SpacingKey | number;
  paddingBottom?: SpacingKey | number;
  paddingLeft?: SpacingKey | number;

  margin?: SpacingKey | number | 'auto';
  marginHorizontal?: SpacingKey | number | 'auto';
  marginVertical?: SpacingKey | number | 'auto';
  marginTop?: SpacingKey | number | 'auto';
  marginRight?: SpacingKey | number | 'auto';
  marginBottom?: SpacingKey | number | 'auto';
  marginLeft?: SpacingKey | number | 'auto';

  borderRadius?: RadiusKey | number;
  borderTopLeftRadius?: RadiusKey | number;
  borderTopRightRadius?: RadiusKey | number;
  borderBottomLeftRadius?: RadiusKey | number;
  borderBottomRightRadius?: RadiusKey | number;

  background?: SurfaceColor;
  backgroundOpacity?: OpacityKey | number;
  unsafe_backgroundRaw?: string;
  shadow?: ElevationKey;

  flex?: number;
  flexDirection?: ViewStyle['flexDirection'];
  alignItems?: ViewStyle['alignItems'];
  justifyContent?: ViewStyle['justifyContent'];
  flexWrap?: ViewStyle['flexWrap'];
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: ViewStyle['flexBasis'];
  gap?: SpacingKey | number;
  alignSelf?: ViewStyle['alignSelf'];

  width?: ViewStyle['width'];
  height?: ViewStyle['height'];
  minWidth?: ViewStyle['minWidth'];
  minHeight?: ViewStyle['minHeight'];
  maxWidth?: ViewStyle['maxWidth'];
  maxHeight?: ViewStyle['maxHeight'];

  position?: ViewStyle['position'];
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  zIndex?: number;

  overflow?: ViewStyle['overflow'];
  opacity?: number;
  borderColor?: SurfaceColor;
  borderWidth?: number;
  borderTopWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;
  borderRightWidth?: number;
  style?: StyleProp<ViewStyle>;
};

type BoxNativeProps<TNativeProps> = BoxBaseProps & Omit<TNativeProps, keyof BoxBaseProps | 'style'>;

export type BoxViewProps = BoxNativeProps<ViewProps> & {
  as?: typeof View;
  ref?: React.Ref<View>;
};

/**
 * Non-View Box variants are intentionally style-normalized and ref-less.
 * Use raw Pressable/TouchableOpacity when callback styles or imperative refs are required.
 */
export type BoxPressableProps = Omit<BoxBaseProps, 'style'> &
  Omit<PressableProps, keyof BoxBaseProps | 'style'> & {
    as: typeof Pressable;
    ref?: never;
    style?: PressableProps['style'];
  };

export type BoxTouchableOpacityProps = BoxNativeProps<TouchableOpacityProps> & {
  as: typeof TouchableOpacity;
  ref?: never;
};

export type BoxPolymorphicProps = BoxViewProps | BoxPressableProps | BoxTouchableOpacityProps;
export type BoxProps = BoxPolymorphicProps;

export type BoxComponent = {
  (props: BoxViewProps): React.ReactElement | null;
  (props: BoxPressableProps): React.ReactElement | null;
  (props: BoxTouchableOpacityProps): React.ReactElement | null;
  displayName?: string;
};

const BoxInner = forwardRef<View, BoxPolymorphicProps>((initialProps, ref) => {
  const { boxProps, restProps } = extractBoxProps(initialProps);
  const {
    as,
    padding,
    paddingHorizontal,
    paddingVertical,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    margin,
    marginHorizontal,
    marginVertical,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    borderRadius,
    borderTopLeftRadius,
    borderTopRightRadius,
    borderBottomLeftRadius,
    borderBottomRightRadius,
    background,
    backgroundOpacity,
    unsafe_backgroundRaw,
    shadow,
    flex,
    flexDirection,
    alignItems,
    justifyContent,
    flexWrap,
    flexGrow,
    flexShrink,
    flexBasis,
    gap,
    alignSelf,
    width,
    height,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    position,
    top,
    right,
    bottom,
    left,
    zIndex,
    overflow,
    opacity,
    borderColor,
    borderWidth,
    borderTopWidth,
    borderBottomWidth,
    borderLeftWidth,
    borderRightWidth,
    style,
  } = boxProps;

  const { children, ...finalRestProps } = restProps;

  const { theme } = useTheme();

  const boxStyles = useMemo(() => {
    const resolvedStyles: ViewStyle = {
      padding: resolvePaddingSpacing(padding),
      paddingHorizontal: resolvePaddingSpacing(paddingHorizontal),
      paddingVertical: resolvePaddingSpacing(paddingVertical),
      paddingTop: resolvePaddingSpacing(paddingTop),
      paddingRight: resolvePaddingSpacing(paddingRight),
      paddingBottom: resolvePaddingSpacing(paddingBottom),
      paddingLeft: resolvePaddingSpacing(paddingLeft),

      margin: resolveMarginSpacing(margin) as ViewStyle['margin'],
      marginHorizontal: resolveMarginSpacing(marginHorizontal) as ViewStyle['marginHorizontal'],
      marginVertical: resolveMarginSpacing(marginVertical) as ViewStyle['marginVertical'],
      marginTop: resolveMarginSpacing(marginTop) as ViewStyle['marginTop'],
      marginRight: resolveMarginSpacing(marginRight) as ViewStyle['marginRight'],
      marginBottom: resolveMarginSpacing(marginBottom) as ViewStyle['marginBottom'],
      marginLeft: resolveMarginSpacing(marginLeft) as ViewStyle['marginLeft'],

      borderRadius: resolveRadius(borderRadius),
      borderTopLeftRadius: resolveRadius(borderTopLeftRadius),
      borderTopRightRadius: resolveRadius(borderTopRightRadius),
      borderBottomLeftRadius: resolveRadius(borderBottomLeftRadius),
      borderBottomRightRadius: resolveRadius(borderBottomRightRadius),

      backgroundColor: unsafe_backgroundRaw
        ? resolveThemeColor(theme, unsafe_backgroundRaw, backgroundOpacity)
        : resolveThemeColor(theme, background, backgroundOpacity),

      flex,
      flexDirection,
      alignItems,
      justifyContent,
      flexWrap,
      flexGrow,
      flexShrink,
      flexBasis,
      gap: resolvePaddingSpacing(gap),
      alignSelf,

      width,
      height,
      minWidth,
      minHeight,
      maxWidth,
      maxHeight,

      position,
      top,
      right,
      bottom,
      left,
      zIndex,

      overflow,
      opacity,
      borderColor: resolveThemeColor(theme, borderColor),
      borderWidth,
      borderTopWidth,
      borderBottomWidth,
      borderLeftWidth,
      borderRightWidth,
    };

    if (shadow && shadow !== 'none') {
      const elevationStyle = Shape.elevation[shadow as ElevationKey];
      Object.assign(resolvedStyles, elevationStyle);
    }

    return resolvedStyles;
  }, [
    theme,
    padding,
    paddingHorizontal,
    paddingVertical,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    margin,
    marginHorizontal,
    marginVertical,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    borderRadius,
    borderTopLeftRadius,
    borderTopRightRadius,
    borderBottomLeftRadius,
    borderBottomRightRadius,
    background,
    backgroundOpacity,
    unsafe_backgroundRaw,
    shadow,
    flex,
    flexDirection,
    alignItems,
    justifyContent,
    flexWrap,
    flexGrow,
    flexShrink,
    flexBasis,
    gap,
    alignSelf,
    width,
    height,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    position,
    top,
    right,
    bottom,
    left,
    zIndex,
    overflow,
    opacity,
    borderColor,
    borderWidth,
    borderTopWidth,
    borderBottomWidth,
    borderLeftWidth,
    borderRightWidth,
  ]);

  const resolvedStyle = [boxStyles, style as StyleProp<ViewStyle>];

  if (as === TouchableOpacity) {
    return (
      <TouchableOpacity
        style={resolvedStyle}
        {...(finalRestProps as Omit<TouchableOpacityProps, keyof BoxBaseProps | 'style'>)}
      >
        {children as React.ReactNode}
      </TouchableOpacity>
    );
  }

  if (as === Pressable) {
    const pressableStyle =
      typeof style === 'function'
        ? (state: PressableStateCallbackType) => [boxStyles, style(state)]
        : resolvedStyle;

    return (
      <Pressable
        style={pressableStyle}
        {...(finalRestProps as Omit<PressableProps, keyof BoxBaseProps | 'style'>)}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View
      ref={ref}
      style={resolvedStyle}
      {...(finalRestProps as Omit<ViewProps, keyof BoxBaseProps | 'style'>)}
    >
      {children as React.ReactNode}
    </View>
  );
});

BoxInner.displayName = 'Box';

export const Box = BoxInner as BoxComponent;

Box.displayName = 'Box';
