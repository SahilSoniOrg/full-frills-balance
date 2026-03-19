import React from 'react'
import { SpacingKey } from '@/src/constants/design-tokens'
import { Box, type BoxProps } from './Box'

export type InsetProps = Omit<BoxProps, 'top' | 'bottom' | 'left' | 'right'> & {
  space?: SpacingKey | number
  top?: SpacingKey | number
  bottom?: SpacingKey | number
  left?: SpacingKey | number
  right?: SpacingKey | number
  horizontal?: SpacingKey | number
  vertical?: SpacingKey | number
}

/**
 * Inset - Layout component for padding
 * Specialized for adding consistent internal spacing.
 */
export const Inset = ({
  children,
  space,
  top,
  bottom,
  left,
  right,
  horizontal,
  vertical,
  ...boxProps
}: InsetProps) => {
  return (
    <Box
      padding={space}
      paddingTop={top}
      paddingBottom={bottom}
      paddingLeft={left}
      paddingRight={right}
      paddingHorizontal={horizontal}
      paddingVertical={vertical}
      {...boxProps}
    >
      {children}
    </Box>
  )
}
