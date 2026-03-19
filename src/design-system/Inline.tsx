import { SpacingKey } from '@/src/constants/design-tokens'
import React, { forwardRef } from 'react'
import { View } from 'react-native'
import { Box, type BoxProps } from './Box'

export type InlineProps = Omit<BoxProps, 'flexDirection'> & {
  space?: SpacingKey | number
  align?: BoxProps['alignItems']
  justify?: BoxProps['justifyContent']
  wrap?: boolean
}

export const Inline = forwardRef<View, InlineProps>((
  {
    space,
    align,
    justify,
    wrap = false,
    children,
    ...props
  },
  ref
) => {
  return (
    <Box
      ref={ref}
      flexDirection="row"
      gap={space}
      alignItems={align}
      justifyContent={justify}
      flexWrap={wrap ? 'wrap' : undefined}
      {...props}
    >
      {children}
    </Box>
  )
})

Inline.displayName = 'Inline'
