import { ThemeMode, Typography } from '@/constants/design-tokens'
import { useThemeColors } from '@/constants/theme-helpers'
import { useTheme } from '@/src/hooks/use-theme'
import { ComponentVariant, getVariantColors } from '@/src/utils/style-helpers'
import { useMemo } from 'react'
import { StyleSheet, Text, type TextProps } from 'react-native'

export type AppTextProps = TextProps & {
  // Typography variants - limited and intentional
  variant?: 'caption' | 'body' | 'subheading' | 'heading' | 'title' | 'xl' | 'hero'
  // Semantic color options
  color?: ComponentVariant
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
  color = 'text',
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

  const textStyle = useMemo(() => {
    const typographyStyles = (() => {
      switch (variant) {
        case 'caption':
          return styles.caption
        case 'body':
          return styles.body
        case 'subheading':
          return styles.subheading
        case 'heading':
          return styles.heading
        case 'title':
          return styles.title
        case 'xl':
          return styles.xl
        case 'hero':
          return styles.hero
        default:
          return styles.body
      }
    })()

    const fontWeight = (() => {
      switch (weight) {
        case 'medium':
          return '600' as const
        case 'semibold':
          return '700' as const
        case 'bold':
          return 'bold' as const
        default:
          return 'normal' as const
      }
    })()

    const variantColors = getVariantColors(theme, color)

    return [
      typographyStyles,
      {
        color: variantColors.main,
        textAlign: align,
        fontWeight,
        fontStyle: (italic ? 'italic' : 'normal') as 'italic' | 'normal',
      },
      style,
    ]
  }, [variant, weight, color, theme, align, italic, style])

  return <Text style={textStyle} {...props} />
}

const styles = StyleSheet.create({
  caption: {
    fontSize: Typography.sizes.xs,
    lineHeight: Typography.sizes.xs * Typography.lineHeights.normal,
    fontFamily: Typography.fonts.regular,
    letterSpacing: Typography.letterSpacing.normal,
  },
  body: {
    fontSize: Typography.sizes.base,
    lineHeight: Typography.sizes.base * Typography.lineHeights.normal,
    fontFamily: Typography.fonts.regular,
    letterSpacing: Typography.letterSpacing.normal,
  },
  subheading: {
    fontSize: Typography.sizes.lg,
    lineHeight: Typography.sizes.lg * Typography.lineHeights.tight,
    fontFamily: Typography.fonts.subheading,
    letterSpacing: Typography.letterSpacing.tight,
  },
  heading: {
    fontSize: Typography.sizes.xl,
    lineHeight: Typography.sizes.xl * Typography.lineHeights.tight,
    fontFamily: Typography.fonts.heading,
    letterSpacing: Typography.letterSpacing.tight,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    lineHeight: Typography.sizes.xxxl * Typography.lineHeights.tight,
    fontFamily: Typography.fonts.heading,
    letterSpacing: Typography.letterSpacing.tight,
  },
  xl: {
    fontSize: Typography.sizes.xxl,
    lineHeight: Typography.sizes.xxl * Typography.lineHeights.tight,
    fontFamily: Typography.fonts.heading,
    letterSpacing: Typography.letterSpacing.tight,
  },
  hero: {
    fontSize: Typography.sizes.hero,
    lineHeight: Typography.sizes.hero * Typography.lineHeights.tight,
    fontFamily: Typography.fonts.bold,
    letterSpacing: Typography.letterSpacing.tight,
  },
})
