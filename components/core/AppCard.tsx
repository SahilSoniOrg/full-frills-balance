import { Shape, Spacing, ThemeMode } from '@/constants/design-tokens'
import { useThemeColors } from '@/constants/theme-helpers'
import { useTheme } from '@/hooks/use-theme'
import { useMemo } from 'react'
import { StyleSheet, View, type ViewProps } from 'react-native'

export type AppCardProps = ViewProps & {
  // Elevation levels - limited options
  elevation?: 'none' | 'sm' | 'md' | 'lg'
  // Padding options
  padding?: 'none' | 'sm' | 'md' | 'lg'
  // Border radius options
  radius?: 'sm' | 'md' | 'lg' | 'xl' | 'r1' | 'r2' | 'r3' | 'r4'
  // Background variant
  variant?: 'default' | 'secondary'
  // Theme mode override (for design preview)
  themeMode?: ThemeMode
}

export function AppCard({
  elevation = 'sm',
  padding = 'md',
  radius = 'r2',
  variant = 'default',
  themeMode,
  style,
  children,
  ...props
}: AppCardProps) {
  const { theme: globalTheme, tokens: globalTokens } = useTheme()
  const overrideTheme = useThemeColors(themeMode)
  const theme = themeMode ? overrideTheme : globalTheme
  const tokens = useMemo(() =>
    themeMode ? { card: { background: theme.surface, border: theme.border } } : globalTokens,
    [themeMode, theme, globalTokens])

  const cardStyle = useMemo(() => {
    const elevationStyles = Shape.elevation[elevation]
    const radiusStyles = { borderRadius: Shape.radius[radius] }

    const paddingStyles = (() => {
      switch (padding) {
        case 'none': return styles.paddingNone
        case 'sm': return styles.paddingSm
        case 'md': return styles.paddingMd
        case 'lg': return styles.paddingLg
        default: return styles.paddingMd
      }
    })()

    const backgroundColor = variant === 'secondary' ? theme.surfaceSecondary : tokens.card.background

    return [
      styles.card,
      elevationStyles,
      paddingStyles,
      radiusStyles,
      { backgroundColor },
      style,
    ]
  }, [elevation, padding, radius, variant, theme, tokens, style])

  return (
    <View style={cardStyle} {...props}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  paddingNone: { padding: 0 },
  paddingSm: { padding: Spacing.md },
  paddingMd: { padding: Spacing.lg },
  paddingLg: { padding: Spacing.xl },
})
