/**
 * Theme Hook - Enhanced theme system with design tokens
 * Provides access to design tokens with proper TypeScript support
 */

import { useColorScheme } from 'react-native'
import { Colors, ThemeMode } from './design-tokens'

// Enhanced theme colors with semantic naming
export const useThemeColors = (mode?: ThemeMode) => {
  const systemColorScheme = useColorScheme()
  const theme = mode || systemColorScheme || 'light'
  
  return Colors[theme]
}

// Helper function to get color by semantic name
export const getSemanticColor = (colorName: string, mode?: ThemeMode) => {
  const colors = useThemeColors(mode)
  return colors[colorName as keyof typeof colors] || colors.text
}

// Theme-aware style helpers
export const createThemedStyle = <T extends Record<string, any>>(
  lightStyles: T,
  darkStyles?: Partial<T>
) => {
  const useThemedStyles = (mode?: ThemeMode) => {
    const theme = mode || 'light'
    return theme === 'dark' ? { ...lightStyles, ...darkStyles } : lightStyles
  }
  
  return useThemedStyles
}
