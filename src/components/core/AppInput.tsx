/**
 * AppInput - Themed TextInput component
 * Consistent input design inspired by Ivy Wallet
 */

import { AppText } from '@/src/components/core/AppText'
import { Shape, Size, Spacing, ThemeMode, Typography } from '@/src/constants/design-tokens'
import { useThemeColors } from '@/src/constants/theme-helpers'
import { useTheme } from '@/src/hooks/use-theme'
import React from 'react'
import { StyleSheet, TextInput, type TextInputProps, View, ViewStyle } from 'react-native'

export type AppInputProps = TextInputProps & {
    label?: string
    error?: string
    defaultValue?: string
    variant?: 'default' | 'hero' | 'minimal'
    containerStyle?: ViewStyle
    themeMode?: ThemeMode
}

export function AppInput({
    label,
    error,
    variant = 'default',
    containerStyle,
    themeMode,
    style,
    ...props
}: AppInputProps) {
    const { theme: globalTheme, tokens: globalTokens } = useTheme()
    const overrideTheme = useThemeColors(themeMode)
    const theme = themeMode ? overrideTheme : globalTheme
    const tokens = themeMode ? { input: { background: theme.surface, border: theme.border, text: theme.text, placeholder: theme.textSecondary } } : globalTokens

    return (
        <View style={[styles.container, containerStyle]}>
            {label && (
                <AppText
                    variant="body"
                    weight="medium"
                    style={styles.label}
                    themeMode={themeMode}
                >
                    {label}
                </AppText>
            )}
            <TextInput
                style={[
                    styles.input,
                    variant === 'hero' && styles.heroInput,
                    variant === 'minimal' && styles.minimalInput,
                    {
                        borderColor: error ? theme.error : (variant === 'minimal' ? 'transparent' : theme.border),
                        color: theme.text,
                        backgroundColor: variant === 'minimal' ? 'transparent' : theme.surface,
                    },
                    style,
                ]}
                placeholderTextColor={tokens.input.placeholder}
                {...props}
            />
            {error && (
                <AppText
                    variant="caption"
                    color="error"
                    style={styles.error}
                    themeMode={themeMode}
                >
                    {error}
                </AppText>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    label: {
        marginBottom: Spacing.xs,
    },
    input: {
        borderWidth: 1,
        borderRadius: Shape.radius.r3,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        fontSize: Typography.sizes.base,
        minHeight: Size.inputMd,
    },
    heroInput: {
        fontSize: Typography.sizes.hero,
        fontFamily: Typography.fonts.bold,
        textAlign: 'center',
        borderWidth: 0,
        minHeight: Size.xxl * 2.5,
    },
    minimalInput: {
        borderWidth: 0,
        paddingHorizontal: 0,
        paddingVertical: 0,
        minHeight: 0,
    },
    error: {
        marginTop: Spacing.xs,
    },
})
