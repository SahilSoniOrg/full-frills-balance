import { ThemeMode, Typography } from '@/src/constants/design-tokens'
import { useThemedComponent } from '@/src/hooks/useThemedComponent'
import { ComponentVariant, getVariantColors } from '@/src/utils/style-helpers'
import { useMemo } from 'react'
import { StyleSheet, Text, type TextProps } from 'react-native'

export type AppTextProps = TextProps & {
  variant?: 'caption' | 'body' | 'subheading' | 'heading' | 'title' | 'xl' | 'hero'
  color?: ComponentVariant
  align?: 'auto' | 'left' | 'right' | 'center' | 'justify'
  weight?: 'regular' | 'medium' | 'semibold' | 'bold'
  italic?: boolean
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
  const { theme, fonts } = useThemedComponent(themeMode)

  const textStyle = useMemo(() => {
    const typographyStyles = (() => {
      switch (variant) {
        case 'caption': return styles.caption
        case 'body': return styles.body
        case 'subheading': return styles.subheading
        case 'heading': return styles.heading
        case 'title': return styles.title
        case 'xl': return styles.xl
        case 'hero': return styles.hero
        default: return styles.body
      }
    })()

    const resolvedFontFamily = (() => {
      // For heading variants, strictly use the heading font (Serif)
      if (['heading', 'title', 'xl', 'hero'].includes(variant)) {
        return fonts.heading
      }
      // For subheading, use the specific subheading definition
      if (variant === 'subheading') {
        return fonts.subheading
      }
      // For body/caption, delegate to the weight prop to select the right Sans-Serif file
      return fonts[weight] || fonts.regular
    })()

    const variantColors = getVariantColors(theme, color)

    return [
      // Base styles (fontSize, lineHeight) - we intentionally override fontFamily below
      typographyStyles,
      {
        color: variantColors.main,
        textAlign: align,
        fontFamily: resolvedFontFamily,
        // We do NOT set fontWeight here because we are selecting the specific font file
        // that already embodies the weight (e.g. InstrumentSans-Bold).
        // Setting fontWeight: 'bold' effectively double-applies it or breaks linking.
        fontStyle: (italic ? 'italic' : 'normal') as 'italic' | 'normal',
      },
      style,
    ]
  }, [variant, weight, color, theme, fonts, align, italic, style])

  return <Text style={textStyle} {...props} />
}

const styles = StyleSheet.create({
  caption: {
    fontSize: Typography.sizes.xs,
    lineHeight: Typography.sizes.xs * Typography.lineHeights.normal,
    letterSpacing: Typography.letterSpacing.normal,
  },
  body: {
    fontSize: Typography.sizes.base,
    lineHeight: Typography.sizes.base * Typography.lineHeights.normal,
    letterSpacing: Typography.letterSpacing.normal,
  },
  subheading: {
    fontSize: Typography.sizes.lg,
    lineHeight: Typography.sizes.lg * Typography.lineHeights.tight,
    letterSpacing: Typography.letterSpacing.tight,
  },
  heading: {
    fontSize: Typography.sizes.xl,
    lineHeight: Typography.sizes.xl * Typography.lineHeights.tight,
    letterSpacing: Typography.letterSpacing.tight,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    lineHeight: Typography.sizes.xxxl * Typography.lineHeights.tight,
    letterSpacing: Typography.letterSpacing.tight,
  },
  xl: {
    fontSize: Typography.sizes.xxl,
    lineHeight: Typography.sizes.xxl * Typography.lineHeights.tight,
    letterSpacing: Typography.letterSpacing.tight,
  },
  hero: {
    fontSize: Typography.sizes.hero,
    lineHeight: Typography.sizes.hero * Typography.lineHeights.tight,
    letterSpacing: Typography.letterSpacing.tight,
  },
})
