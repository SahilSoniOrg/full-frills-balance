import { Box, type BoxProps } from '@/src/components/core/Box'
import { SpacingKey } from '@/src/constants/design-tokens'
import React from 'react'

export type StackProps = Omit<BoxProps, 'direction'> & {
    space?: SpacingKey
    horizontal?: boolean
}

/**
 * Stack - A layout primitive for linear stacks of elements with consistent spacing.
 */
export function Stack({
    space,
    horizontal = false,
    children,
    ...props
}: StackProps) {
    return (
        <Box
            direction={horizontal ? 'row' : 'column'}
            gap={space}
            {...props}
        >
            {children}
        </Box>
    )
}
