import { SpacingKey } from '@/src/constants/design-tokens'
import React, { forwardRef } from 'react'
import { View } from 'react-native'
import { Box, type BoxProps } from './Box'

export type StackProps = Omit<BoxProps, 'flexDirection'> & {
  space?: SpacingKey | number
  align?: BoxProps['alignItems']
}

export const Stack = forwardRef<View, StackProps>((
  {
    space,
    align,
    children,
    ...props
  },
  ref
) => {
  return (
    <Box
      ref={ref}
      flexDirection="column"
      gap={space}
      alignItems={align}
      {...props}
    >
      {children}
    </Box>
  )
})

Stack.displayName = 'Stack'
