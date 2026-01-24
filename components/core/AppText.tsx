/**
 * AppText - Opinionated text component with typography scale
 * Clean, consistent typography inspired by Ivy Wallet
 */

import { ThemeMode, Typography } from '@/constants/design-tokens'
import { useThemeColors } from '@/constants/theme-helpers'
import { useTheme } from '@/hooks/use-theme'
import { StyleSheet, Text, type TextProps } from 'react-native'

export type AppTextProps = TextProps & {
  // Typography variants - limited and intentional
  variant?: 'caption' | 'body' | 'subheading' | 'heading' | 'title' | 'xl' | 'hero'
  // Semantic color options
  color?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'asset' | 'liability' | 'equity' | 'income' | 'expense'
  // Text alignment
  align?: 'auto' | 'left' | 'right' | 'center' | 'justify'
  // Weight variants
  weight?: 'regular' | 'medium' | 'semibold' | 'bold'
  // Italic support
  italic?: boolean
  // Theme mode override (for design preview)
  themeMode?: ThemeMode
}

export function AppText({
  variant = 'body',
  color = 'primary',
  align = 'auto',
  weight = 'regular',
  italic = false,
  themeMode,
  style,
  ...props
}: AppTextProps) {
  const { theme: globalTheme } = useTheme()
  const overrideTheme = useThemeColors(themeMode)
  const theme = themeMode ? overrideTheme : globalTheme

  // Get typography styles based on variant
  const getTypographyStyles = () => {
    switch (variant) {
      case 'caption':
        return {
          fontSize: Typography.sizes.xs,
          lineHeight: Typography.sizes.xs * Typography.lineHeights.normal,
          fontFamily: Typography.fonts.regular,
          letterSpacing: Typography.letterSpacing.normal,
        }
      case 'body':
        return {
          fontSize: Typography.sizes.base,
          lineHeight: Typography.sizes.base * Typography.lineHeights.normal,
          fontFamily: Typography.fonts.regular,
          letterSpacing: Typography.letterSpacing.normal,
        }
      case 'subheading':
        return {
          fontSize: Typography.sizes.lg,
          lineHeight: Typography.sizes.lg * Typography.lineHeights.tight,
          fontFamily: Typography.fonts.subheading,
          letterSpacing: Typography.letterSpacing.tight,
        }
      case 'heading':
        return {
          fontSize: Typography.sizes.xl,
          lineHeight: Typography.sizes.xl * Typography.lineHeights.tight,
          fontFamily: Typography.fonts.heading,
          letterSpacing: Typography.letterSpacing.tight,
        }
      case 'title':
        return {
          fontSize: Typography.sizes.xxxl,
          lineHeight: Typography.sizes.xxxl * Typography.lineHeights.tight,
          fontFamily: Typography.fonts.heading,
          letterSpacing: Typography.letterSpacing.tight,
        }
      case 'xl':
        return {
          fontSize: Typography.sizes.xxl,
          lineHeight: Typography.sizes.xxl * Typography.lineHeights.tight,
          fontFamily: Typography.fonts.heading,
          letterSpacing: Typography.letterSpacing.tight,
        }
      case 'hero':
        return {
          fontSize: Typography.sizes.hero,
          lineHeight: Typography.sizes.hero * Typography.lineHeights.tight,
          fontFamily: Typography.fonts.bold,
          letterSpacing: Typography.letterSpacing.tight,
        }
      default:
        return {}
    }
  }

  // Get color based on semantic name
  const getColor = () => {
    switch (color) {
      case 'primary':
        return theme.text
      case 'secondary':
        return theme.textSecondary
      case 'tertiary':
        return theme.textTertiary
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
        return theme.text
    }
  }

  // Get font weight
  const getFontWeight = () => {
    switch (weight) {
      case 'medium':
        return '600'
      case 'semibold':
        return '700'
      case 'bold':
        return 'bold'
      default:
        return 'normal'
    }
  }

  return (
    <Text
      style={[
        styles.text,
        getTypographyStyles(),
        {
          color: getColor(),
          textAlign: align,
          fontWeight: getFontWeight(),
          fontStyle: italic ? 'italic' : 'normal',
        },
        style,
      ]}
      {...props}
    />
  )
}

const styles = StyleSheet.create({
  text: {
    // Base text styles
  },
})
