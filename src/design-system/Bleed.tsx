import React from 'react'
import { SpacingKey } from '@/src/constants/design-tokens'
import { Box } from './Box'
import { negateSpace } from './utils'

export type BleedProps = {
  children: React.ReactNode
  space?: SpacingKey | number
  top?: SpacingKey | number
  bottom?: SpacingKey | number
  left?: SpacingKey | number
  right?: SpacingKey | number
  horizontal?: SpacingKey | number
  vertical?: SpacingKey | number
}

/**
 * Bleed - Layout component for negative margins
 * Allows content to "bleed" into the surrounding layout.
 */
export const Bleed = ({
  children,
  space,
  top,
  bottom,
  left,
  right,
  horizontal,
  vertical,
}: BleedProps) => {
  return (
    <Box
      margin={space ? negateSpace(space) : undefined}
      marginTop={top ? negateSpace(top) : undefined}
      marginBottom={bottom ? negateSpace(bottom) : undefined}
      marginLeft={left ? negateSpace(left) : undefined}
      marginRight={right ? negateSpace(right) : undefined}
      marginHorizontal={horizontal ? negateSpace(horizontal) : undefined}
      marginVertical={vertical ? negateSpace(vertical) : undefined}
    >
      {children}
    </Box>
  )
}
