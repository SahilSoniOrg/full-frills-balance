import { ElevationKey, RadiusKey, ThemeMode } from '@/src/constants/design-tokens'
import { Box } from '@/src/design-system/Box'
import React from 'react'
import { type ViewProps } from 'react-native'

export type AppCardProps = ViewProps & {
  elevation?: ElevationKey
  padding?: 'none' | 'sm' | 'md' | 'lg'
  radius?: RadiusKey
  variant?: 'default' | 'secondary'
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
  const paddingValue = (() => {
    switch (padding) {
      case 'none': return 0
      case 'sm': return 'md'
      case 'md': return 'lg'
      case 'lg': return 'xl'
      default: return 'lg'
    }
  })()

  const background = variant === 'secondary' ? 'surfaceSecondary' : 'surface'

  return (
    <Box
      themeMode={themeMode}
      background={background}
      padding={paddingValue}
      borderRadius={radius}
      shadow={elevation}
      overflow="hidden"
      style={style}
      {...props}
    >
      {children}
    </Box>
  )
}
