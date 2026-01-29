/**
 * IconButton - Consistent circular button with icon
 * Encodes visual identity for navigation and action buttons
 */

import { Opacity, Shape, Size, Spacing } from '@/src/constants/design-tokens'
import { useTheme } from '@/src/hooks/use-theme'
import React from 'react'
import {
    StyleSheet,
    TouchableOpacity,
    type TouchableOpacityProps,
    type ViewStyle
} from 'react-native'
import { AppIcon, IconName } from './AppIcon'

export type IconButtonVariant = 'primary' | 'surface' | 'clear' | 'error' | 'success'

export type IconButtonProps = Omit<TouchableOpacityProps, 'children'> & {
    name: IconName
    size?: number
    variant?: IconButtonVariant
    iconColor?: string
}

export function IconButton({
    name,
    size = Size.md,
    variant = 'surface',
    iconColor,
    style,
    onPress,
    ...props
}: IconButtonProps) {
    const { theme } = useTheme()

    const getVariantStyles = (): ViewStyle => {
        switch (variant) {
            case 'primary':
                return {
                    backgroundColor: theme.primary,
                }
            case 'surface':
                return {
                    backgroundColor: theme.surface,
                    ...Shape.elevation.sm,
                }
            case 'clear':
                return {
                    backgroundColor: 'transparent',
                }
            case 'error':
                return {
                    backgroundColor: theme.error,
                }
            case 'success':
                return {
                    backgroundColor: theme.success,
                }
            default:
                return {}
        }
    }

    const getIconColor = () => {
        if (iconColor) return iconColor
        switch (variant) {
            case 'primary':
            case 'error':
            case 'success':
                return theme.pureInverse
            case 'surface':
                return theme.text
            case 'clear':
                return theme.primary
            default:
                return theme.text
        }
    }

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={Opacity.heavy}
            style={[
                styles.button,
                getVariantStyles(),
                style
            ]}
            hitSlop={{ top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm }}
            {...props}
        >
            <AppIcon name={name} size={size} color={getIconColor()} />
        </TouchableOpacity>
    )
}

const styles = StyleSheet.create({
    button: {
        width: Size.xl,
        height: Size.xl,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
})
