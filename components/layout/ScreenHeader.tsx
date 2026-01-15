/**
 * ScreenHeader - App-specific layout primitive
 * Provides consistent screen header with title and actions
 * 
 * NOT part of design system - reduces duplication in app screens only
 */

import { AppText } from '@/components/core'
import { Spacing } from '@/constants'
import React from 'react'
import { View, type ViewProps } from 'react-native'

export type ScreenHeaderProps = ViewProps & {
  title: string
  actions?: React.ReactNode
  subtitle?: string
}

export function ScreenHeader({ title, actions, subtitle, style, ...props }: ScreenHeaderProps) {
  return (
    <View 
      style={[{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        marginBottom: Spacing.md,
      }, style]}
      {...props}
    >
      <View style={{ flex: 1 }}>
        <AppText variant="heading">{title}</AppText>
        {subtitle && (
          <AppText variant="body" color="secondary">{subtitle}</AppText>
        )}
      </View>
      {actions && <View style={{ marginLeft: Spacing.md }}>{actions}</View>}
    </View>
  )
}
