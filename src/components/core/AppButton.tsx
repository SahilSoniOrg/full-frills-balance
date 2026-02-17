import { AppText } from '@/src/components/core/AppText'
import { Opacity, Shape, Size, Spacing, ThemeMode, Typography } from '@/src/constants/design-tokens'
import { useThemedComponent } from '@/src/hooks/useThemedComponent'
import { ComponentVariant, getVariantColors } from '@/src/utils/style-helpers'
import React, { useMemo } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  type TouchableOpacityProps
} from 'react-native'

export type AppButtonProps = TouchableOpacityProps & {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: string
  themeMode?: ThemeMode
}

export function AppButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  disabled,
  style,
  onPress,
  themeMode,
  ...props
}: AppButtonProps) {
  const { theme, fonts } = useThemedComponent(themeMode)

  const { buttonCombinedStyle, textCombinedStyle, finalTextColor } = useMemo(() => {
    const helperVariant: ComponentVariant = variant === 'secondary' ? 'default' : 'primary'
    const variantColors = getVariantColors(theme, helperVariant)

    const baseStyles = styles.buttonBase
    let variantStyle = {}
    let textColor = theme.text

    switch (variant) {
      case 'primary':
        variantStyle = {
          backgroundColor: disabled ? theme.textTertiary : variantColors.main,
        }
        textColor = variantColors.contrast
        break
      case 'secondary':
        variantStyle = {
          backgroundColor: disabled ? theme.surfaceSecondary : theme.surface,
          borderWidth: 1,
          borderColor: disabled ? theme.textTertiary : theme.border,
        }
        textColor = disabled ? theme.textTertiary : theme.text
        break
      case 'outline':
        variantStyle = {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: disabled ? theme.textTertiary : theme.primary,
        }
        textColor = disabled ? theme.textTertiary : theme.primary
        break
      case 'ghost':
        variantStyle = {
          backgroundColor: 'transparent',
        }
        textColor = disabled ? theme.textTertiary : theme.primary
        break
    }

    const sizeStyles = (() => {
      switch (size) {
        case 'sm': return styles.sizeSm
        case 'md': return styles.sizeMd
        case 'lg': return styles.sizeLg
        default: return styles.sizeMd
      }
    })()

    const textTypography = (() => {
      switch (size) {
        case 'sm': return styles.textSm
        case 'md': return styles.textMd
        case 'lg': return styles.textLg
        default: return styles.textMd
      }
    })()

    return {
      buttonCombinedStyle: [
        baseStyles,
        variantStyle,
        sizeStyles,
        style
      ],
      textCombinedStyle: [
        styles.textBase,
        textTypography,
        { color: textColor, fontFamily: fonts.semibold }
      ],
      finalTextColor: textColor
    }
  }, [theme, variant, size, disabled, style, fonts])

  return (
    <TouchableOpacity
      style={buttonCombinedStyle}
      disabled={disabled || loading}
      onPress={onPress}
      activeOpacity={Opacity.heavy}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={finalTextColor}
        />
      ) : (
        <AppText style={textCombinedStyle}>
          {children}
        </AppText>
      )}
    </TouchableOpacity>
  )
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
    // dynamic font
  },
  textMd: {
    fontSize: Typography.sizes.base,
    // dynamic font
  },
  textLg: {
    fontSize: Typography.sizes.lg,
    // dynamic font
  },
})
