/**
 * Section - App-specific layout primitive
 * Provides consistent vertical grouping for screen content
 * 
 * NOT part of design system - reduces duplication in app screens only
 */

import { AppText } from '@/src/components/core/AppText'
import { Spacing } from '@/src/constants'
import React from 'react'
import { View, type ViewProps } from 'react-native'

export type SectionProps = ViewProps & {
  title?: string
  children: React.ReactNode
  padding?: 'sm' | 'md' | 'lg'
}

export function Section({ title, children, padding = 'md', style, ...props }: SectionProps) {
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
      {title && (
        <AppText
          variant="subheading"
          color="secondary"
          style={{ marginBottom: Spacing.md }}
        >
          {title.toUpperCase()}
        </AppText>
      )}
      {children}
    </View>
  )
}
