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
import { View, type ViewProps, type ViewStyle } from 'react-native';
import { resolveRadius, resolveSpacing, resolveThemeColor } from './utils';

export type BoxProps = ViewProps & {
  as?: React.ComponentType<any>;
  padding?: SpacingKey | number;
  paddingHorizontal?: SpacingKey | number;
  paddingVertical?: SpacingKey | number;
  paddingTop?: SpacingKey | number;
  paddingRight?: SpacingKey | number;
  paddingBottom?: SpacingKey | number;
  paddingLeft?: SpacingKey | number;

  margin?: SpacingKey | number;
  marginHorizontal?: SpacingKey | number;
  marginVertical?: SpacingKey | number;
  marginTop?: SpacingKey | number;
  marginRight?: SpacingKey | number;
  marginBottom?: SpacingKey | number;
  marginLeft?: SpacingKey | number;

  borderRadius?: RadiusKey | number;
  borderTopLeftRadius?: RadiusKey | number;
  borderTopRightRadius?: RadiusKey | number;
  borderBottomLeftRadius?: RadiusKey | number;
  borderBottomRightRadius?: RadiusKey | number;

  background?: ColorKey;
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
};

export const Box = forwardRef<View, BoxProps>(
  (
    {
      as: Component = View,
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
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const { theme } = useTheme();

    const boxStyles = useMemo(() => {
      const resolvedStyles: ViewStyle = {
        padding: resolveSpacing(padding),
        paddingHorizontal: resolveSpacing(paddingHorizontal),
        paddingVertical: resolveSpacing(paddingVertical),
        paddingTop: resolveSpacing(paddingTop),
        paddingRight: resolveSpacing(paddingRight),
        paddingBottom: resolveSpacing(paddingBottom),
        paddingLeft: resolveSpacing(paddingLeft),

        margin: resolveSpacing(margin),
        marginHorizontal: resolveSpacing(marginHorizontal),
        marginVertical: resolveSpacing(marginVertical),
        marginTop: resolveSpacing(marginTop),
        marginRight: resolveSpacing(marginRight),
        marginBottom: resolveSpacing(marginBottom),
        marginLeft: resolveSpacing(marginLeft),

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
        gap: resolveSpacing(gap),
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
      };

      if (shadow && shadow !== 'none') {
        const elevationStyle = Shape.elevation[shadow];
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
    ]);

    const ComponentToUse = Component as any;

    return (
      <ComponentToUse ref={ref} style={[boxStyles, style]} {...props}>
        {children}
      </ComponentToUse>
    );
  },
);

Box.displayName = 'Box';
