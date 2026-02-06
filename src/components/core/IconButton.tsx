/**
 * IconButton - Consistent circular button with icon
 * Encodes visual identity for navigation and action buttons
 */

import { AppIcon, IconName } from '@/src/components/core/AppIcon'
import { Opacity, Shape, Size, Spacing } from '@/src/constants/design-tokens'
import { useTheme } from '@/src/hooks/use-theme'
import React from 'react'
import {
    StyleSheet,
    TouchableOpacity,
    type TouchableOpacityProps,
    type ViewStyle
} from 'react-native'

export type IconButtonVariant = 'primary' | 'surface' | 'clear' | 'error' | 'success'

export type IconButtonProps = Omit<TouchableOpacityProps, 'children'> & {
    name: IconName
    size?: number
    variant?: IconButtonVariant
    iconColor?: string
}

type VariantConfig = {
    backgroundColor: ViewStyle['backgroundColor']
    iconColor: string
    elevation?: ViewStyle
}

const VARIANTS: Record<IconButtonVariant, (theme: ReturnType<typeof useTheme>['theme'], disabled: boolean) => VariantConfig> = {
    primary: (theme, disabled) => ({
        backgroundColor: disabled ? theme.textTertiary : theme.primary,
        iconColor: disabled ? theme.textTertiary : theme.pureInverse,
    }),
    surface: (theme, disabled) => ({
        backgroundColor: disabled ? theme.textTertiary : theme.surface,
        iconColor: disabled ? theme.textTertiary : theme.text,
        elevation: Shape.elevation.sm,
    }),
    clear: (theme, disabled) => ({
        backgroundColor: 'transparent',
        iconColor: disabled ? theme.textTertiary : theme.primary,
    }),
    error: (theme, disabled) => ({
        backgroundColor: disabled ? theme.textTertiary : theme.error,
        iconColor: disabled ? theme.textTertiary : theme.pureInverse,
    }),
    success: (theme, disabled) => ({
        backgroundColor: disabled ? theme.textTertiary : theme.success,
        iconColor: disabled ? theme.textTertiary : theme.pureInverse,
    }),
}

export function IconButton({
    name,
    size = Size.md,
    variant = 'surface',
    iconColor,
    style,
    onPress,
    disabled,
    ...props
}: IconButtonProps) {
    const { theme } = useTheme()

    const config = VARIANTS[variant](theme, disabled ?? false)
    const finalIconColor = iconColor ?? config.iconColor

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={Opacity.heavy}
            style={[
                styles.button,
                { backgroundColor: config.backgroundColor },
                config.elevation,
                style
            ]}
            hitSlop={{ top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm }}
            disabled={disabled}
            {...props}
        >
            <AppIcon name={name} size={size} color={finalIconColor} />
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
