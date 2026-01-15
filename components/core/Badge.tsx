/**
 * Badge - Small, informative badge component
 * Clean, minimal badge design inspired by Ivy Wallet
 */

import { Shape, Spacing, ThemeMode, Typography } from '@/constants/design-tokens'
import { useThemeColors } from '@/constants/theme-helpers'
import { StyleSheet, View, type ViewProps } from 'react-native'
import { AppText } from './AppText'

export type BadgeProps = ViewProps & {
  // Badge content
  children: string
  // Badge variants - limited options
  variant?: 'default' | 'success' | 'warning' | 'error' | 'asset' | 'liability' | 'equity' | 'income' | 'expense'
  // Badge size
  size?: 'sm' | 'md'
  // Theme mode override (for design preview)
  themeMode?: ThemeMode
}

export function Badge({ 
  children,
  variant = 'default',
  size = 'md',
  themeMode,
  style,
  ...props 
}: BadgeProps) {
  const theme = useThemeColors(themeMode)
  
  // Get badge styles based on variant
  const getBadgeStyles = () => {
    const baseStyles = {
      borderRadius: Shape.radius.sm,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      alignSelf: 'flex-start' as const,
    }

    switch (variant) {
      case 'success':
        return {
          ...baseStyles,
          backgroundColor: theme.successLight,
        }
      case 'warning':
        return {
          ...baseStyles,
          backgroundColor: theme.warningLight,
        }
      case 'error':
        return {
          ...baseStyles,
          backgroundColor: theme.errorLight,
        }
      case 'asset':
        return {
          ...baseStyles,
          backgroundColor: theme.primaryLight,
        }
      case 'liability':
        return {
          ...baseStyles,
          backgroundColor: theme.warningLight,
        }
      case 'equity':
        return {
          ...baseStyles,
          backgroundColor: theme.successLight,
        }
      case 'income':
        return {
          ...baseStyles,
          backgroundColor: theme.successLight,
        }
      case 'expense':
        return {
          ...baseStyles,
          backgroundColor: theme.errorLight,
        }
      default:
        return {
          ...baseStyles,
          backgroundColor: theme.surfaceSecondary,
        }
    }
  }

  // Get padding styles based on size
  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          paddingHorizontal: Spacing.sm,
          paddingVertical: Spacing.xs,
          minWidth: 20,
          minHeight: 20,
        }
      case 'md':
        return {
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.xs,
          minWidth: 24,
          minHeight: 24,
        }
      default:
        return {
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.xs,
          minWidth: 24,
          minHeight: 24,
        }
    }
  }

  // Get text color based on variant
  const getTextColor = () => {
    switch (variant) {
      case 'success':
        return theme.success
      case 'warning':
        return theme.warning
      case 'error':
        return theme.error
      case 'asset':
        return theme.asset
      case 'liability':
        return theme.liability
      case 'equity':
        return theme.equity
      case 'income':
        return theme.income
      case 'expense':
        return theme.expense
      default:
        return theme.textSecondary
    }
  }

  // Get text styles based on size
  const getTextStyles = () => {
    switch (size) {
      case 'sm':
        return {
          fontSize: Typography.sizes.xs,
          fontFamily: Typography.fonts.semibold,
        }
      case 'md':
        return {
          fontSize: Typography.sizes.sm,
          fontFamily: Typography.fonts.semibold,
        }
      default:
        return {
          fontSize: Typography.sizes.sm,
          fontFamily: Typography.fonts.semibold,
        }
    }
  }

  return (
    <View
      style={[
        styles.badge,
        getBadgeStyles(),
        getSizeStyles(),
        style,
      ]}
      {...props}
    >
      <AppText
        variant="caption"
        style={[
          getTextStyles(),
          { color: getTextColor() }
        ]}
      >
        {children}
      </AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    // Base badge styles
  },
})
