/**
 * AppButton - Minimal, opinionated button component
 * Clean button design with limited variants inspired by Ivy Wallet
 */

import { Shape, Spacing, ThemeMode, Typography } from '@/constants/design-tokens'
import { useThemeColors } from '@/constants/theme-helpers'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
  type TouchableOpacityProps
} from 'react-native'

export type AppButtonProps = TouchableOpacityProps & {
  // Button variants - limited and intentional
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  // Button size
  size?: 'sm' | 'md' | 'lg'
  // Loading state
  loading?: boolean
  // Button text
  children: string
  // Theme mode override (for design preview)
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
  const theme = useThemeColors(themeMode)

  // Get button styles based on variant
  const getButtonStyles = (): ViewStyle => {
    const baseStyles = {
      borderRadius: Shape.radius.full,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    }

    switch (variant) {
      case 'primary':
        return {
          ...baseStyles,
          backgroundColor: disabled ? theme.textTertiary : theme.primary,
        }
      case 'secondary':
        return {
          ...baseStyles,
          backgroundColor: disabled ? theme.surfaceSecondary : theme.surface,
          borderWidth: 1,
          borderColor: disabled ? theme.textTertiary : theme.border,
        }
      case 'outline':
        return {
          ...baseStyles,
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: disabled ? theme.textTertiary : theme.primary,
        }
      case 'ghost':
        return {
          ...baseStyles,
          backgroundColor: 'transparent',
        }
      default:
        return baseStyles
    }
  }

  // Get padding styles based on size
  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.sm,
          minHeight: 32,
        }
      case 'md':
        return {
          paddingHorizontal: Spacing.xl,
          paddingVertical: Spacing.md,
          minHeight: 44,
        }
      case 'lg':
        return {
          paddingHorizontal: Spacing.xxxl,
          paddingVertical: Spacing.lg,
          minHeight: 52,
        }
      default:
        return {
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
          minHeight: 44,
        }
    }
  }

  // Get text color based on variant
  const getTextColor = () => {
    if (disabled) return theme.textTertiary

    switch (variant) {
      case 'primary':
        return '#FFFFFF' // Always white on primary
      case 'secondary':
        return theme.text
      case 'outline':
        return theme.primary
      case 'ghost':
        return theme.primary
      default:
        return theme.text
    }
  }

  // Get text styles based on size
  const getTextStyles = () => {
    switch (size) {
      case 'sm':
        return {
          fontSize: Typography.sizes.sm,
          fontFamily: Typography.fonts.semibold,
        }
      case 'md':
        return {
          fontSize: Typography.sizes.base,
          fontFamily: Typography.fonts.semibold,
        }
      case 'lg':
        return {
          fontSize: Typography.sizes.lg,
          fontFamily: Typography.fonts.semibold,
        }
      default:
        return {
          fontSize: Typography.sizes.base,
          fontFamily: Typography.fonts.semibold,
        }
    }
  }

  return (
    <TouchableOpacity
      style={[
        styles.button,
        getButtonStyles(),
        getSizeStyles(),
        style,
      ]}
      disabled={disabled || loading}
      onPress={onPress}
      activeOpacity={0.7}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={getTextColor()}
        />
      ) : (
        <Text
          style={[
            styles.text,
            getTextStyles(),
            {
              color: getTextColor(),
            },
          ]}
        >
          {children}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    // Base button styles
  },
  text: {
    // Base text styles
    textAlign: 'center',
    includeFontPadding: false,
  },
})
