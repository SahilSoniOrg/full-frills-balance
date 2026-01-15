/**
 * Section - App-specific layout primitive
 * Provides consistent vertical grouping for screen content
 * 
 * NOT part of design system - reduces duplication in app screens only
 */

import { Spacing } from '@/constants'
import React from 'react'
import { View, type ViewProps } from 'react-native'

export type SectionProps = ViewProps & {
  // No variants - this is a simple layout primitive
  children: React.ReactNode
  padding?: 'sm' | 'md' | 'lg'
}

export function Section({ children, padding = 'md', style, ...props }: SectionProps) {
  const getPadding = () => {
    switch (padding) {
      case 'sm':
        return Spacing.lg
      case 'md':
        return Spacing.xxl
      case 'lg':
        return Spacing.xxxl
      default:
        return Spacing.xxl
    }
  }
  
  return (
    <View 
      style={[{
        paddingHorizontal: getPadding(),
        paddingVertical: getPadding() / 2,
      }, style]}
      {...props}
    >
      {children}
    </View>
  )
}
