/**
 * AppInput - Themed TextInput component
 * Consistent input design inspired by Ivy Wallet
 */

import { AppIcon, IconName } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { Shape, Size, Spacing, ThemeMode, Typography } from '@/src/constants/design-tokens';
import { useThemedComponent } from '@/src/hooks/useThemedComponent';
import React from 'react';
import { StyleSheet, TextInput, type TextInputProps, View, ViewStyle } from 'react-native';

export type AppInputProps = TextInputProps & {
    label?: string
    error?: string
    defaultValue?: string
    variant?: 'default' | 'hero' | 'minimal'
    containerStyle?: ViewStyle
    themeMode?: ThemeMode
    leftIcon?: IconName
}

export function AppInput({
    label,
    error,
    variant = 'default',
    containerStyle,
    themeMode,
    style,
    leftIcon,
    ...props
}: AppInputProps) {
    const { theme, tokens } = useThemedComponent(themeMode)

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
            <View style={[
                styles.inputContainer,
                variant === 'hero' && styles.heroInputContainer,
                variant === 'minimal' && styles.minimalInputContainer,
                {
                    borderColor: error ? theme.error : (variant === 'minimal' ? 'transparent' : theme.border),
                    backgroundColor: variant === 'minimal' ? 'transparent' : theme.surface,
                },
            ]}>
                {leftIcon && (
                    <View style={styles.iconContainer}>
                        <AppIcon name={leftIcon} size={20} color={tokens.input.placeholder} />
                    </View>
                )}
                <TextInput
                    style={[
                        styles.input,
                        variant === 'hero' && styles.heroInput,
                        { color: theme.text },
                        style
                    ]}
                    placeholderTextColor={tokens.input.placeholder}
                    {...props}
                />
            </View>
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
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: Shape.radius.r3,
        paddingHorizontal: Spacing.md,
        minHeight: Size.inputMd,
    },
    heroInputContainer: {
        borderWidth: 0,
        minHeight: Size.xxl * 2.5,
        justifyContent: 'center',
    },
    minimalInputContainer: {
        borderWidth: 0,
        minHeight: 0,
        paddingHorizontal: 0,
    },
    input: {
        flex: 1,
        paddingVertical: Spacing.sm,
        fontSize: Typography.sizes.base,
        minHeight: Size.inputMd,
    },
    heroInput: {
        fontSize: Typography.sizes.hero,
        fontFamily: Typography.fonts.bold,
        textAlign: 'center',
        minHeight: Size.xxl * 2.5,
    },
    iconContainer: {
        marginRight: Spacing.sm,
    },
    error: {
        marginTop: Spacing.xs,
    },
})
