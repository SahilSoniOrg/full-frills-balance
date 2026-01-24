import { SpacingKey } from '@/constants/design-tokens'
import React from 'react'
import { Box, type BoxProps } from './Box'

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
