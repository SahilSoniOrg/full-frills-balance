import { AppText } from '@/src/components/core/AppText';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { ComponentVariant } from '@/src/utils/style-helpers';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  type TouchableOpacityProps,
} from 'react-native';

export type AppButtonProps = TouchableOpacityProps & {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'destructive-outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
};

export function AppButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  disabled,
  style,
  onPress,
  ...props
}: AppButtonProps) {
  const { theme, fonts, getVariantColors } = useTheme();

  const { buttonCombinedStyle, textCombinedStyle, finalTextColor } = useMemo(() => {
    const helperVariant: ComponentVariant =
      variant === 'secondary'
        ? 'default'
        : variant === 'destructive' || variant === 'destructive-outline'
          ? 'error'
          : 'primary';
    const variantColors = getVariantColors(helperVariant);

    const baseStyles = styles.buttonBase;
    let variantStyle = {};
    let textColor = theme.text;

    switch (variant) {
      case 'primary':
        variantStyle = {
          backgroundColor: disabled ? theme.surfaceSecondary : variantColors.main,
        };
        textColor = disabled ? theme.textTertiary : variantColors.contrast;
        break;
      case 'destructive':
        variantStyle = {
          backgroundColor: disabled ? theme.surfaceSecondary : variantColors.main,
        };
        textColor = disabled ? theme.textTertiary : variantColors.contrast;
        break;
      case 'destructive-outline':
        variantStyle = {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: disabled ? theme.textTertiary : variantColors.main,
        };
        textColor = disabled ? theme.textTertiary : variantColors.main;
        break;
      case 'secondary':
        variantStyle = {
          backgroundColor: disabled ? theme.surfaceSecondary : theme.surface,
          borderWidth: 1,
          borderColor: disabled ? theme.textTertiary : theme.border,
        };
        textColor = disabled ? theme.textTertiary : theme.text;
        break;
      case 'outline':
        variantStyle = {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: disabled ? theme.textTertiary : theme.primary,
        };
        textColor = disabled ? theme.textTertiary : theme.primary;
        break;
      case 'ghost':
        variantStyle = {
          backgroundColor: 'transparent',
        };
        textColor = disabled ? theme.textTertiary : theme.primary;
        break;
    }

    const sizeStyles = (() => {
      switch (size) {
        case 'sm':
          return styles.sizeSm;
        case 'md':
          return styles.sizeMd;
        case 'lg':
          return styles.sizeLg;
        default:
          return styles.sizeMd;
      }
    })();

    const textTypography = (() => {
      switch (size) {
        case 'sm':
          return styles.textSm;
        case 'md':
          return styles.textMd;
        case 'lg':
          return styles.textLg;
        default:
          return styles.textMd;
      }
    })();

    return {
      buttonCombinedStyle: [baseStyles, variantStyle, sizeStyles, style],
      textCombinedStyle: [
        styles.textBase,
        textTypography,
        { color: textColor, fontFamily: fonts.semibold },
      ],
      finalTextColor: textColor,
    };
  }, [theme, variant, size, disabled, style, fonts, getVariantColors]);

  const isTextContent = (node: React.ReactNode): boolean => {
    if (typeof node === 'string' || typeof node === 'number') return true;
    if (Array.isArray(node)) {
      return node.every(
        child =>
          child === null ||
          child === undefined ||
          typeof child === 'boolean' ||
          isTextContent(child),
      );
    }
    return false;
  };

  const renderChildren = () => {
    if (loading) {
      return <ActivityIndicator size="small" color={finalTextColor} />;
    }
    if (isTextContent(children)) {
      return <AppText style={textCombinedStyle}>{children}</AppText>;
    }
    return React.Children.map(children, child => {
      if (typeof child === 'string' || typeof child === 'number') {
        return <AppText style={textCombinedStyle}>{child}</AppText>;
      }
      return child;
    });
  };

  return (
    <TouchableOpacity
      style={buttonCombinedStyle}
      disabled={disabled || loading}
      onPress={onPress}
      activeOpacity={Opacity.heavy}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      {...props}
    >
      {renderChildren()}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  buttonBase: {
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBase: {
    textAlign: 'center',
    includeFontPadding: false,
  },
  sizeSm: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: Size.buttonSm,
  },
  sizeMd: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    minHeight: Size.buttonMd,
  },
  sizeLg: {
    paddingHorizontal: Spacing.xxxl,
    paddingVertical: Spacing.lg,
    minHeight: Size.buttonLg,
  },
  textSm: {
    fontSize: Typography.sizes.sm,
  },
  textMd: {
    fontSize: Typography.sizes.base,
  },
  textLg: {
    fontSize: Typography.sizes.lg,
  },
});
