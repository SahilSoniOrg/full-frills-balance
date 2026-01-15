/**
 * Screen - App-specific layout primitive
 * Provides consistent screen layout with safe area and background
 * 
 * NOT part of design system - reduces duplication in app screens only
 */

import { useThemeColors } from '@/constants'
import React from 'react'
import { type ViewProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export type ScreenProps = ViewProps & {
  // No variants - this is a simple layout primitive
  children: React.ReactNode
}

export function Screen({ children, style, ...props }: ScreenProps) {
  const theme = useThemeColors()
  
  return (
    <SafeAreaView 
      style={[{
        flex: 1,
        backgroundColor: theme.background,
      }, style]}
      {...props}
    >
      {children}
    </SafeAreaView>
  )
}
