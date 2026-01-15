/**
 * AppCard - Consistent card component with elevation and radius
 * Clean, minimal card design inspired by Ivy Wallet
 */

import { Shape, Spacing, ThemeMode } from '@/constants/design-tokens'
import { useThemeColors } from '@/constants/theme-helpers'
import { StyleSheet, View, type ViewProps } from 'react-native'

export type AppCardProps = ViewProps & {
  // Elevation levels - limited options
  elevation?: 'none' | 'sm' | 'md' | 'lg'
  // Padding options
  padding?: 'none' | 'sm' | 'md' | 'lg'
  // Border radius options
  radius?: 'sm' | 'md' | 'lg' | 'xl'
  // Background variant
  variant?: 'default' | 'secondary'
  // Theme mode override (for design preview)
  themeMode?: ThemeMode
}

export function AppCard({ 
  elevation = 'sm',
  padding = 'md',
  radius = 'lg',
  variant = 'default',
  themeMode,
  style,
  children,
  ...props 
}: AppCardProps) {
  const theme = useThemeColors(themeMode)
  
  // Get elevation styles
  const getElevationStyles = () => {
    return Shape.elevation[elevation]
  }

  // Get padding styles
  const getPaddingStyles = () => {
    switch (padding) {
      case 'none':
        return { padding: 0 }
      case 'sm':
        return { padding: Spacing.sm }
      case 'md':
        return { padding: Spacing.lg }
      case 'lg':
        return { padding: Spacing.xxl }
      default:
        return { padding: Spacing.lg }
    }
  }

  // Get border radius styles
  const getRadiusStyles = () => {
    return {
      borderRadius: Shape.radius[radius],
    }
  }

  // Get background color
  const getBackgroundColor = () => {
    switch (variant) {
      case 'secondary':
        return theme.surfaceSecondary
      default:
        return theme.surface
    }
  }

  return (
    <View
      style={[
        styles.card,
        getElevationStyles(),
        getPaddingStyles(),
        getRadiusStyles(),
        {
          backgroundColor: getBackgroundColor(),
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    // Base card styles
    overflow: 'hidden',
  },
})
