import { Spacing, SpacingKey } from '@/constants/design-tokens'
import React from 'react'
import { View, type ViewProps, type ViewStyle } from 'react-native'

export type BoxProps = ViewProps & {
    padding?: SpacingKey
    paddingHorizontal?: SpacingKey
    paddingVertical?: SpacingKey
    margin?: SpacingKey
    marginHorizontal?: SpacingKey
    marginVertical?: SpacingKey
    flex?: number
    direction?: 'row' | 'column'
    align?: 'flex-start' | 'center' | 'flex-end' | 'stretch'
    justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around'
    gap?: SpacingKey
    backgroundColor?: string
    borderRadius?: number
    style?: ViewStyle | ViewStyle[]
}

/**
 * Box - A primitive layout component for consistent spacing and positioning.
 */
export function Box({
    padding,
    paddingHorizontal,
    paddingVertical,
    margin,
    marginHorizontal,
    marginVertical,
    flex,
    direction = 'column',
    align,
    justify,
    gap,
    backgroundColor,
    borderRadius,
    style,
    children,
    ...props
}: BoxProps) {
    const boxStyle: ViewStyle = {
        flex,
        flexDirection: direction,
        alignItems: align,
        justifyContent: justify,
        backgroundColor,
        borderRadius,
        ...(padding && { padding: Spacing[padding] }),
        ...(paddingHorizontal && { paddingHorizontal: Spacing[paddingHorizontal] }),
        ...(paddingVertical && { paddingVertical: Spacing[paddingVertical] }),
        ...(margin && { margin: Spacing[margin] }),
        ...(marginHorizontal && { marginHorizontal: Spacing[marginHorizontal] }),
        ...(marginVertical && { marginVertical: Spacing[marginVertical] }),
        ...(gap && { gap: Spacing[gap] }),
    }

    return (
        <View style={[boxStyle, style]} {...props}>
            {children}
        </View>
    )
}
